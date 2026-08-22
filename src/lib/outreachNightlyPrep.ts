/**
 * Phase 5 nightly prep orchestrator.
 * Creates reviewable agent drafts only — never imports or calls Resend/send helpers.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import {
  allocateChannelsForDay,
  type AllocateChannelsForDayResult,
} from '@/lib/outreachChannelAllocation';
import { computeChannelAllocationWeights } from '@/lib/outreachChannelWeights';
import { computeProductSelectionWeights } from '@/lib/outreachProductWeights';
import { computeFitBandRankingWeights } from '@/lib/outreachFitBandWeights';
import { generateOgrProductOutreachDrafts } from '@/lib/generateOgrProductOutreachDraft';
import { loadOutreachGoalDashboardSnapshot } from '@/lib/outreachGoalDashboard';
import type { OutreachGoalSettings } from '@/lib/outreachGoals';
import type { OutreachPerformanceReport } from '@/lib/outreachPerformance';
import { formatOutreachPreparationDate, selectOutreachTargets } from '@/lib/outreachSelectTargets';
import { AGENT_OUTREACH_PENDING_DRAFT_STATUSES } from '@/lib/outreachSelectionConstants';
import {
  nextSellingDayAfter,
  nextSellingDayOnOrAfter,
  zonedLocalToUtcIso,
} from '@/lib/outreachSellingDays';
import {
  SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL,
  SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH,
} from '@/lib/systemMessages';

type Client = SupabaseClient<Database>;

export const OUTREACH_NIGHTLY_PREP_KIND = 'nightly_prep' as const;
export const OUTREACH_NIGHTLY_PREP_CHUNK = 5;
export const OUTREACH_NIGHTLY_PREP_STALE_MS = 15 * 60 * 1000;

export type OutreachAutomationRunStatus =
  'running' | 'succeeded' | 'partial' | 'empty_pool' | 'failed';

export type OutreachAutomationRunRow = {
  id: string;
  runDate: string;
  kind: typeof OUTREACH_NIGHTLY_PREP_KIND;
  status: OutreachAutomationRunStatus;
  trigger: 'cron' | 'manual';
  capacity: number;
  pendingBefore: number;
  netCapacity: number;
  selectedCount: number;
  producedCount: number;
  skippedCount: number;
  failedCount: number;
  shortfall: number;
  channelAllocation: AllocateChannelsForDayResult | Record<string, unknown>;
  error: string | null;
  targetErrors: Array<{ prospectId: number; error: string }>;
  reason: string | null;
  startedAt: string;
  finishedAt: string | null;
  triggeredBy: string | null;
};

type DbRunRow = Database['public']['Tables']['outreach_automation_runs']['Row'];

function mapRunRow(row: DbRunRow): OutreachAutomationRunRow {
  const allocation =
    row.channel_allocation && typeof row.channel_allocation === 'object'
      ? (row.channel_allocation as AllocateChannelsForDayResult)
      : {};
  const targetErrors = Array.isArray(row.target_errors)
    ? (row.target_errors as Array<{ prospectId: number; error: string }>)
    : [];
  return {
    id: row.id,
    runDate: row.run_date,
    kind: OUTREACH_NIGHTLY_PREP_KIND,
    status: row.status,
    trigger: row.trigger,
    capacity: row.capacity,
    pendingBefore: row.pending_before,
    netCapacity: row.net_capacity,
    selectedCount: row.selected_count,
    producedCount: row.produced_count,
    skippedCount: row.skipped_count,
    failedCount: row.failed_count,
    shortfall: row.shortfall,
    channelAllocation: allocation,
    error: row.error,
    targetErrors,
    reason: row.reason,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    triggeredBy: row.triggered_by,
  };
}

export async function getOutreachAutomationRunByDate(
  client: Client,
  runDate: string,
): Promise<{ ok: true; run: OutreachAutomationRunRow | null } | { ok: false; error: string }> {
  const { data, error } = await client
    .from('outreach_automation_runs')
    .select('*')
    .eq('kind', OUTREACH_NIGHTLY_PREP_KIND)
    .eq('run_date', runDate)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, run: data ? mapRunRow(data) : null };
}

async function updateRun(
  client: Client,
  id: string,
  patch: Database['public']['Tables']['outreach_automation_runs']['Update'],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client.from('outreach_automation_runs').update(patch).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Count pending agent drafts already counting toward a preparation date.
 * Paginates system_messages and unions payload.preparationDate matches with
 * automation_run_id stamps for that date (avoids list-cap undercount).
 */
export async function countPendingDraftsForPreparationDate(
  client: Client,
  preparationDate: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const runLookup = await getOutreachAutomationRunByDate(client, preparationDate);
  if (!runLookup.ok) return { ok: false, error: runLookup.error };
  const runId = runLookup.run?.id ?? null;

  const pageSize = 100;
  const maxRows = 2000;
  const seen = new Set<string>();
  let offset = 0;

  while (offset < maxRows) {
    const { data, error } = await client
      .from('system_messages')
      .select('id, automation_run_id, payload')
      .eq('message_type', SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH)
      .eq('origin', SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL)
      .in('status', [...AGENT_OUTREACH_PENDING_DRAFT_STATUSES])
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) return { ok: false, error: error.message };

    const rows = data ?? [];
    for (const row of rows) {
      const payload =
        row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : {};
      const generation =
        payload.generation &&
        typeof payload.generation === 'object' &&
        !Array.isArray(payload.generation)
          ? (payload.generation as Record<string, unknown>)
          : null;
      const prep =
        typeof generation?.preparationDate === 'string' ? generation.preparationDate : null;
      const matchesPrep = prep === preparationDate;
      const matchesRun = runId != null && row.automation_run_id === runId;
      if (matchesPrep || matchesRun) {
        seen.add(row.id);
      }
    }

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return { ok: true, count: seen.size };
}

export type RunOutreachNightlyPrepInput = {
  client: Client;
  trigger: 'cron' | 'manual';
  /** Staff user for manual; null for cron (uses OUTREACH_PREP_ACTOR_USER_ID). */
  triggeredBy?: string | null;
  /**
   * Selling date being prepared (YYYY-MM-DD).
   * Default: next selling day after today in business TZ.
   * Manual may pass today when today is a selling day.
   */
  preparationDate?: string;
  asOf?: Date;
};

export type RunOutreachNightlyPrepResult =
  | {
      ok: true;
      run: OutreachAutomationRunRow;
      noop: boolean;
      conflict?: boolean;
    }
  | { ok: false; error: string; status?: number; run?: OutreachAutomationRunRow };

function resolvePrepActorUserId(triggeredBy: string | null | undefined): string | null {
  if (triggeredBy?.trim()) return triggeredBy.trim();
  const envActor =
    (import.meta.env.OUTREACH_PREP_ACTOR_USER_ID as string | undefined)?.trim() || '';
  return envActor || null;
}

function finalizeStatus(params: {
  netCapacity: number;
  selectedCount: number;
  producedCount: number;
  failedCount: number;
  reason?: string | null;
}): {
  status: OutreachAutomationRunStatus;
  reason: string | null;
} {
  const { netCapacity, selectedCount, producedCount, failedCount, reason } = params;
  if (reason === 'goal_met_or_non_selling' || reason === 'already_at_pace') {
    return { status: 'succeeded', reason };
  }
  if (netCapacity > 0 && selectedCount === 0) {
    return { status: 'empty_pool', reason: reason ?? 'empty_pool' };
  }
  if (failedCount > 0 && producedCount > 0) {
    return { status: 'partial', reason: reason ?? 'partial' };
  }
  if (failedCount > 0 && producedCount === 0 && selectedCount > 0) {
    return { status: 'failed', reason: reason ?? 'all_targets_failed' };
  }
  return { status: 'succeeded', reason: reason ?? null };
}

/**
 * Prepare reviewable drafts for a selling day. Idempotent per (kind, run_date).
 */
export async function runOutreachNightlyPrep(
  input: RunOutreachNightlyPrepInput,
): Promise<RunOutreachNightlyPrepResult> {
  const client = input.client;
  const asOf = input.asOf ?? new Date();
  const userId = resolvePrepActorUserId(input.triggeredBy);

  const goalsSnap = await loadOutreachGoalDashboardSnapshot({ client, asOf });
  if (!goalsSnap.ok) return { ok: false, error: goalsSnap.error };
  const timeZone = goalsSnap.snapshot.settings.businessTimezone;
  const today = formatOutreachPreparationDate(asOf, timeZone);

  let runDate = input.preparationDate?.trim() || nextSellingDayAfter(today);
  if (input.preparationDate?.trim()) {
    // Validate YYYY-MM-DD; allow today catch-up only when selling day
    runDate = input.preparationDate.trim();
  }

  // Pace as-of start of run_date so weekday recommendedDailySends is non-zero
  const runDateAsOf = new Date(zonedLocalToUtcIso(`${runDate}T12:00:00`, timeZone));
  const paceSnap = await loadOutreachGoalDashboardSnapshot({ client, asOf: runDateAsOf });
  if (!paceSnap.ok) return { ok: false, error: paceSnap.error };
  const capacity = paceSnap.snapshot.pace.recommendedDailySends;

  const existing = await getOutreachAutomationRunByDate(client, runDate);
  if (!existing.ok) return { ok: false, error: existing.error };

  if (existing.run) {
    const run = existing.run;
    if (run.status === 'succeeded' || run.status === 'empty_pool') {
      return { ok: true, run, noop: true };
    }
    if (run.status === 'running') {
      const startedMs = Date.parse(run.startedAt);
      const age = Number.isFinite(startedMs) ? Date.now() - startedMs : 0;
      if (age < OUTREACH_NIGHTLY_PREP_STALE_MS) {
        return {
          ok: false,
          error: 'Prep already running for this date',
          status: 409,
          run,
        };
      }
      await updateRun(client, run.id, {
        status: 'failed',
        error: 'Stale running prep marked failed for retry',
        finished_at: new Date().toISOString(),
        reason: 'stale_running',
      });
    }
    // failed / partial (or stale→failed): retry on same row
    if (run.status === 'failed' || run.status === 'partial' || run.status === 'running') {
      const reset = await updateRun(client, run.id, {
        status: 'running',
        trigger: input.trigger,
        triggered_by: input.triggeredBy ?? null,
        error: null,
        target_errors: [],
        reason: null,
        finished_at: null,
        started_at: new Date().toISOString(),
        produced_count: 0,
        skipped_count: 0,
        failed_count: 0,
        selected_count: 0,
        shortfall: 0,
      });
      if (!reset.ok) return { ok: false, error: reset.error };
      return continuePrep({
        client,
        runId: run.id,
        runDate,
        capacity,
        trigger: input.trigger,
        userId,
        timeZone,
        performance: paceSnap.snapshot.performance,
        settings: paceSnap.snapshot.settings,
      });
    }
  }

  const { data: inserted, error: insertError } = await client
    .from('outreach_automation_runs')
    .insert({
      run_date: runDate,
      kind: OUTREACH_NIGHTLY_PREP_KIND,
      status: 'running',
      trigger: input.trigger,
      capacity,
      triggered_by: input.triggeredBy ?? null,
    })
    .select('*')
    .single();

  if (insertError || !inserted) {
    // Unique violation → re-read and follow idempotency
    const again = await getOutreachAutomationRunByDate(client, runDate);
    if (again.ok && again.run) {
      if (again.run.status === 'succeeded' || again.run.status === 'empty_pool') {
        return { ok: true, run: again.run, noop: true };
      }
      if (again.run.status === 'running') {
        return {
          ok: false,
          error: 'Prep already running for this date',
          status: 409,
          run: again.run,
        };
      }
    }
    return { ok: false, error: insertError?.message ?? 'Failed to insert prep run' };
  }

  return continuePrep({
    client,
    runId: inserted.id,
    runDate,
    capacity,
    trigger: input.trigger,
    userId,
    timeZone,
    performance: paceSnap.snapshot.performance,
    settings: paceSnap.snapshot.settings,
  });
}

async function continuePrep(params: {
  client: Client;
  runId: string;
  runDate: string;
  capacity: number;
  trigger: 'cron' | 'manual';
  userId: string | null;
  timeZone: string;
  performance: OutreachPerformanceReport | null;
  settings: OutreachGoalSettings;
}): Promise<RunOutreachNightlyPrepResult> {
  const { client, runId, runDate, capacity, userId, performance, settings } = params;

  const pending = await countPendingDraftsForPreparationDate(client, runDate);
  if (!pending.ok) {
    await updateRun(client, runId, {
      status: 'failed',
      error: pending.error,
      finished_at: new Date().toISOString(),
    });
    return { ok: false, error: pending.error };
  }

  const pendingBefore = pending.count;
  const netCapacity = Math.max(0, capacity - pendingBefore);

  const { weights, source: weightSource } = computeChannelAllocationWeights({
    report: performance,
    settings,
  });
  const productWeightResult = computeProductSelectionWeights({
    report: performance,
    settings,
  });
  const fitBandWeightResult = computeFitBandRankingWeights({
    report: performance,
    settings,
  });
  const channelAllocation: AllocateChannelsForDayResult = {
    ...allocateChannelsForDay({
      preparationDate: runDate,
      capacity: netCapacity,
      weights,
    }),
    meta: { weightSource, weights },
  };

  let reason: string | null = null;
  if (capacity === 0) {
    reason = 'goal_met_or_non_selling';
  } else if (netCapacity === 0) {
    reason = 'already_at_pace';
  }

  await updateRun(client, runId, {
    capacity,
    pending_before: pendingBefore,
    net_capacity: netCapacity,
    channel_allocation: channelAllocation,
    reason,
  });

  if (netCapacity === 0) {
    const fin = finalizeStatus({
      netCapacity,
      selectedCount: 0,
      producedCount: 0,
      failedCount: 0,
      reason,
    });
    await updateRun(client, runId, {
      status: fin.status,
      reason: fin.reason,
      selected_count: 0,
      produced_count: 0,
      skipped_count: 0,
      failed_count: 0,
      shortfall: 0,
      finished_at: new Date().toISOString(),
    });
    const done = await getOutreachAutomationRunByDate(client, runDate);
    if (!done.ok || !done.run) return { ok: false, error: done.ok ? 'Run missing' : done.error };
    return { ok: true, run: done.run, noop: false };
  }

  const selected = await selectOutreachTargets(client, {
    preparationDate: runDate,
    capacity: netCapacity,
    weights,
    channelAllocation,
    productWeights: productWeightResult.weights,
    globalProductWeight: productWeightResult.globalWeight,
    productWeightSource: productWeightResult.source,
    fitBandWeights: fitBandWeightResult.weights,
    globalFitBandWeight: fitBandWeightResult.globalWeight,
    fitBandWeightSource: fitBandWeightResult.source,
  });
  if (!selected.ok) {
    await updateRun(client, runId, {
      status: 'failed',
      error: selected.error,
      finished_at: new Date().toISOString(),
    });
    return { ok: false, error: selected.error };
  }

  const selectedCount = selected.targets.length;
  const shortfall = Math.max(0, netCapacity - selectedCount);
  await updateRun(client, runId, {
    selected_count: selectedCount,
    shortfall,
    channel_allocation: channelAllocation,
  });

  if (selectedCount === 0) {
    const fin = finalizeStatus({
      netCapacity,
      selectedCount: 0,
      producedCount: 0,
      failedCount: 0,
    });
    await updateRun(client, runId, {
      status: fin.status,
      reason: fin.reason,
      finished_at: new Date().toISOString(),
    });
    const done = await getOutreachAutomationRunByDate(client, runDate);
    if (!done.ok || !done.run) return { ok: false, error: done.ok ? 'Run missing' : done.error };
    return { ok: true, run: done.run, noop: false };
  }

  let producedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const targetErrors: Array<{ prospectId: number; error: string }> = [];

  const targets = selected.targets;
  for (let i = 0; i < targets.length; i += OUTREACH_NIGHTLY_PREP_CHUNK) {
    const chunk = targets.slice(i, i + OUTREACH_NIGHTLY_PREP_CHUNK);
    const generated = await generateOgrProductOutreachDrafts(client, {
      targets: chunk,
      userId,
      regenerate: false,
      automationRunId: runId,
    });

    for (const r of generated.results) {
      if (r.skipped) {
        skippedCount += 1;
        continue;
      }
      if (r.error) {
        failedCount += 1;
        targetErrors.push({ prospectId: r.prospectId, error: r.error });
        continue;
      }
      if (r.draftId) producedCount += 1;
    }

    await updateRun(client, runId, {
      produced_count: producedCount,
      skipped_count: skippedCount,
      failed_count: failedCount,
      target_errors: targetErrors,
    });
  }

  const fin = finalizeStatus({
    netCapacity,
    selectedCount,
    producedCount,
    failedCount,
  });
  await updateRun(client, runId, {
    status: fin.status,
    reason: fin.reason,
    produced_count: producedCount,
    skipped_count: skippedCount,
    failed_count: failedCount,
    target_errors: targetErrors,
    error: fin.status === 'failed' ? (targetErrors[0]?.error ?? 'All targets failed') : null,
    finished_at: new Date().toISOString(),
  });

  const done = await getOutreachAutomationRunByDate(client, runDate);
  if (!done.ok || !done.run) return { ok: false, error: done.ok ? 'Run missing' : done.error };
  return { ok: true, run: done.run, noop: false };
}

/** Resolve default prep date (next selling day after today). Exported for routes. */
export function defaultNightlyPrepRunDate(asOf: Date, timeZone: string): string {
  const today = formatOutreachPreparationDate(asOf, timeZone);
  return nextSellingDayAfter(today);
}

/** Selling date for briefing: today if selling day else next. */
export function briefingSellingDate(asOf: Date, timeZone: string): string {
  const today = formatOutreachPreparationDate(asOf, timeZone);
  return nextSellingDayOnOrAfter(today);
}

/** Re-export for briefing assembly without pulling select module into cron tests oddly. */
export { SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL, SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH };
