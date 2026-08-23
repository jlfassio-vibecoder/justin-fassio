/**
 * Phase 5 Daily Agent Briefing — assemble on-read from Phases 1–4 + automation runs.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { AllocateChannelsForDayResult } from '@/lib/outreachChannelAllocation';
import { loadOutreachGoalDashboardSnapshot } from '@/lib/outreachGoalDashboard';
import {
  listCallToday,
  listHotLeads,
  listWarmLeads,
  type OutreachLeadRow,
} from '@/lib/outreachLeadLists';
import {
  briefingSellingDate,
  getOutreachAutomationRunByDate,
  type OutreachAutomationRunRow,
} from '@/lib/outreachNightlyPrep';
import type { OutreachPerformanceReport } from '@/lib/outreachPerformance';
import { formatOutreachPreparationDate } from '@/lib/outreachSelectTargets';
import { AGENT_OUTREACH_PENDING_DRAFT_STATUSES } from '@/lib/outreachSelectionConstants';
import type { LeadRuleSource } from '@/lib/outreachLeadRuleCalibration';
import type { OutreachLeadRulesVersion } from '@/lib/outreachLeadRules';
import { resolveOutreachLeadRules } from '@/lib/resolveOutreachLeadRules';
import {
  listAgentProductOutreachDrafts,
  SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH,
} from '@/lib/systemMessages';

type Client = SupabaseClient<Database>;

export type OutreachAutomationRunPublic = {
  id: string;
  runDate: string;
  status: OutreachAutomationRunRow['status'];
  trigger: OutreachAutomationRunRow['trigger'];
  capacity: number;
  pendingBefore: number;
  netCapacity: number;
  selectedCount: number;
  producedCount: number;
  skippedCount: number;
  failedCount: number;
  shortfall: number;
  reason: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type OutreachBriefingDraftRow = {
  draftId: string;
  prospectId: number;
  prospectName: string;
  catalogItemId: string;
  productName: string;
  productSku: string;
  productSlug: string;
  toEmail: string;
  primaryChannel: string | null;
  createdAt: string;
};

export type OutreachBriefingDto = {
  asOfDate: string;
  sellingDate: string;
  prep: {
    run: OutreachAutomationRunPublic | null;
    status: 'missing' | OutreachAutomationRunRow['status'];
    message: string;
  };
  goal: {
    monthlyTarget: number;
    mtdAccounts: number;
    remainingGoal: number;
    projectedAttainment: number;
    recommendedDailySends: number;
    rateSource: string;
    goalMet: boolean;
  };
  drafts: OutreachBriefingDraftRow[];
  channelAllocation: AllocateChannelsForDayResult | null;
  callToday: OutreachLeadRow[];
  hot: OutreachLeadRow[];
  warm: OutreachLeadRow[];
  recentEngagement: Array<{
    prospectId: number;
    prospectName: string;
    lastClickedAt: string;
    clickCount: number;
  }>;
  recentConversions: Array<{
    prospectId: number;
    prospectName: string;
    convertedAt: string;
  }>;
  performance: OutreachPerformanceReport | null;
  leadRules: {
    source: LeadRuleSource;
    version: OutreachLeadRulesVersion;
    adjustedFields: string[];
  };
};

function toPublicRun(run: OutreachAutomationRunRow): OutreachAutomationRunPublic {
  return {
    id: run.id,
    runDate: run.runDate,
    status: run.status,
    trigger: run.trigger,
    capacity: run.capacity,
    pendingBefore: run.pendingBefore,
    netCapacity: run.netCapacity,
    selectedCount: run.selectedCount,
    producedCount: run.producedCount,
    skippedCount: run.skippedCount,
    failedCount: run.failedCount,
    shortfall: run.shortfall,
    reason: run.reason,
    error: run.error,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  };
}

export function prepBannerMessage(params: {
  sellingDate: string;
  run: OutreachAutomationRunRow | null;
}): { status: OutreachBriefingDto['prep']['status']; message: string } {
  const { sellingDate, run } = params;
  if (!run) {
    return {
      status: 'missing',
      message: `No prep run for ${sellingDate}. Run prep now.`,
    };
  }
  const n = run.producedCount;
  switch (run.status) {
    case 'succeeded':
      if (run.reason === 'already_at_pace') {
        return {
          status: 'succeeded',
          message: "Pending drafts already meet today's pace.",
        };
      }
      return {
        status: 'succeeded',
        message: `${n} draft${n === 1 ? '' : 's'} ready for ${sellingDate}.`,
      };
    case 'empty_pool':
      return {
        status: 'empty_pool',
        message: `Eligible pool smaller than pace — drafted all eligible (shortfall ${run.shortfall}).`,
      };
    case 'partial':
      return {
        status: 'partial',
        message: `Prep partial: ${n} ready, ${run.failedCount} failed. Review drafts; use Run prep to retry remainder.`,
      };
    case 'failed':
      return {
        status: 'failed',
        message: `Nightly prep failed: ${run.error ?? 'unknown error'}.`,
      };
    case 'running':
      return {
        status: 'running',
        message: `Prep is running for ${sellingDate}…`,
      };
    default:
      return {
        status: 'missing',
        message: `No prep run for ${sellingDate}. Run prep now.`,
      };
  }
}

async function loadRecentEngagement(
  client: Client,
  sinceIso: string,
): Promise<OutreachBriefingDto['recentEngagement']> {
  const { data, error } = await client
    .from('system_messages')
    .select('prospect_id, click_count, last_clicked_at, to_name')
    .eq('message_type', SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH)
    .not('last_clicked_at', 'is', null)
    .gte('last_clicked_at', sinceIso)
    .order('last_clicked_at', { ascending: false })
    .limit(50);

  if (error || !data) return [];

  const byProspect = new Map<
    number,
    { prospectName: string; lastClickedAt: string; clickCount: number }
  >();
  for (const row of data) {
    if (row.prospect_id == null || !row.last_clicked_at) continue;
    const prev = byProspect.get(row.prospect_id);
    const clickCount = Math.max(prev?.clickCount ?? 0, row.click_count ?? 0);
    const lastClickedAt =
      !prev || row.last_clicked_at > prev.lastClickedAt ? row.last_clicked_at : prev.lastClickedAt;
    byProspect.set(row.prospect_id, {
      prospectName: (row.to_name ?? '').trim() || `Prospect #${row.prospect_id}`,
      lastClickedAt,
      clickCount,
    });
  }

  const prospectIds = [...byProspect.keys()];
  if (prospectIds.length > 0) {
    const { data: prospects } = await client
      .from('prospects')
      .select('id, name')
      .in('id', prospectIds);
    for (const p of prospects ?? []) {
      const cur = byProspect.get(p.id);
      if (cur && p.name?.trim()) cur.prospectName = p.name.trim();
    }
  }

  return [...byProspect.entries()]
    .map(([prospectId, v]) => ({ prospectId, ...v }))
    .sort((a, b) => b.lastClickedAt.localeCompare(a.lastClickedAt))
    .slice(0, 25);
}

async function loadRecentConversions(
  client: Client,
  sinceIso: string,
): Promise<OutreachBriefingDto['recentConversions']> {
  const { data: ogr } = await client.from('lines').select('id').eq('code', 'ogr').maybeSingle();
  if (!ogr) return [];
  const { data, error } = await client
    .from('retailer_line_accounts')
    .select('retailer_id, converted_at')
    .eq('sales_line_id', ogr.id)
    .eq('relationship_status', 'opened')
    .not('converted_at', 'is', null)
    .gte('converted_at', sinceIso)
    .order('converted_at', { ascending: false })
    .limit(25);

  if (error || !data) return [];
  const ids = data.map((r) => r.retailer_id);
  const { data: names } = await client.from('prospects').select('id, name').in('id', ids);
  const nameById = new Map((names ?? []).map((p) => [p.id, p.name]));
  return data
    .filter((r) => r.converted_at)
    .map((r) => ({
      prospectId: r.retailer_id,
      prospectName: (nameById.get(r.retailer_id) ?? '').trim() || `Account #${r.retailer_id}`,
      convertedAt: r.converted_at as string,
    }));
}

export async function assembleOutreachBriefing(params: {
  client: Client;
  asOf?: Date;
  /** Phase 2: when set to a non-OGR represented line, return empty book lists. */
  salesLineId?: string | null;
  salesLineCode?: string | null;
}): Promise<{ ok: true; briefing: OutreachBriefingDto } | { ok: false; error: string }> {
  const client = params.client;
  const asOf = params.asOf ?? new Date();
  const lineCode = params.salesLineCode?.trim().toLowerCase() || null;

  // Empty books for Eagle Peak / Big Fish — never fall back to OGR outreach rows.
  if (lineCode && lineCode !== 'ogr') {
    const asOfDate = formatOutreachPreparationDate(asOf, 'America/Vancouver');
    const sellingDate = briefingSellingDate(asOf, 'America/Vancouver');
    const empty: OutreachBriefingDto = {
      asOfDate,
      sellingDate,
      prep: {
        run: null,
        status: 'missing',
        message: `No outreach book for ${lineCode} yet.`,
      },
      goal: {
        monthlyTarget: 0,
        mtdAccounts: 0,
        remainingGoal: 0,
        projectedAttainment: 0,
        recommendedDailySends: 0,
        rateSource: 'none',
        goalMet: false,
      },
      drafts: [],
      channelAllocation: null,
      callToday: [],
      hot: [],
      warm: [],
      recentEngagement: [],
      recentConversions: [],
      performance: null,
      leadRules: { source: 'provisional', version: 'v1-provisional', adjustedFields: [] },
    };
    return { ok: true, briefing: empty };
  }

  const snap = await loadOutreachGoalDashboardSnapshot({ client, asOf });
  if (!snap.ok) return { ok: false, error: snap.error };

  const timeZone = snap.snapshot.settings.businessTimezone;
  const asOfDate = formatOutreachPreparationDate(asOf, timeZone);
  const sellingDate = briefingSellingDate(asOf, timeZone);

  const runLookup = await getOutreachAutomationRunByDate(client, sellingDate);
  if (!runLookup.ok) return { ok: false, error: runLookup.error };
  const run = runLookup.run;
  const banner = prepBannerMessage({ sellingDate, run });

  // Only filter by automationRunId when a run exists; otherwise preparationDate alone.
  // Querying without either returns unrelated pending drafts and skips the fallback.
  let draftsListed = run?.id
    ? await listAgentProductOutreachDrafts(client, {
        statuses: [...AGENT_OUTREACH_PENDING_DRAFT_STATUSES],
        automationRunId: run.id,
        prepScope: true,
        limit: 25,
      })
    : await listAgentProductOutreachDrafts(client, {
        statuses: [...AGENT_OUTREACH_PENDING_DRAFT_STATUSES],
        preparationDate: sellingDate,
        prepScope: true,
        limit: 25,
      });
  if (!draftsListed.ok) return { ok: false, error: draftsListed.error };

  if (run?.id && draftsListed.drafts.length === 0) {
    draftsListed = await listAgentProductOutreachDrafts(client, {
      statuses: [...AGENT_OUTREACH_PENDING_DRAFT_STATUSES],
      preparationDate: sellingDate,
      prepScope: true,
      limit: 25,
    });
    if (!draftsListed.ok) return { ok: false, error: draftsListed.error };
  }

  const drafts: OutreachBriefingDraftRow[] = draftsListed.drafts.map((d) => ({
    draftId: d.id,
    prospectId: d.prospectId,
    prospectName: d.toName,
    catalogItemId: d.catalogItemId,
    productName: d.payload.name,
    productSku: d.payload.sku,
    productSlug: d.payload.slug,
    toEmail: d.toEmail,
    primaryChannel: d.payload.generation?.primaryChannel ?? null,
    createdAt: d.createdAt,
  }));

  // Enrich prospect names
  const draftProspectIds = [...new Set(drafts.map((d) => d.prospectId))];
  if (draftProspectIds.length > 0) {
    const { data: names } = await client
      .from('prospects')
      .select('id, name')
      .in('id', draftProspectIds);
    const nameById = new Map((names ?? []).map((p) => [p.id, p.name?.trim() || '']));
    for (const d of drafts) {
      const n = nameById.get(d.prospectId);
      if (n) d.prospectName = n;
    }
  }

  const channelAllocation =
    run?.channelAllocation &&
    typeof run.channelAllocation === 'object' &&
    'channelOrder' in run.channelAllocation
      ? (run.channelAllocation as AllocateChannelsForDayResult)
      : null;

  const since = new Date(asOf.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const resolvedLeadRules = await resolveOutreachLeadRules({
    client,
    asOf,
    performance: snap.snapshot.performance,
  });

  const [callToday, hot, warm, recentEngagement, recentConversions] = await Promise.all([
    listCallToday(client, asOf, resolvedLeadRules.rules),
    listHotLeads(client, asOf, resolvedLeadRules.rules),
    listWarmLeads(client, asOf, resolvedLeadRules.rules),
    loadRecentEngagement(client, since),
    loadRecentConversions(client, since),
  ]);

  const briefing: OutreachBriefingDto = {
    asOfDate,
    sellingDate,
    prep: {
      run: run ? toPublicRun(run) : null,
      status: banner.status,
      message: banner.message,
    },
    goal: {
      monthlyTarget: snap.snapshot.progress.monthlyTarget,
      mtdAccounts: snap.snapshot.progress.mtdAccounts,
      remainingGoal: snap.snapshot.progress.remainingGoal,
      projectedAttainment: snap.snapshot.pace.projectedAttainment,
      recommendedDailySends: snap.snapshot.pace.recommendedDailySends,
      rateSource: snap.snapshot.pace.rateSource,
      goalMet: snap.snapshot.pace.goalMet,
    },
    drafts,
    channelAllocation,
    callToday,
    hot,
    warm,
    recentEngagement,
    recentConversions,
    performance: snap.snapshot.performance,
    leadRules: {
      source: resolvedLeadRules.source,
      version: resolvedLeadRules.rules.version,
      adjustedFields: resolvedLeadRules.meta.adjustedFields,
    },
  };

  return { ok: true, briefing };
}
