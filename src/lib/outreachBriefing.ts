/**
 * Phase 5 Daily Agent Briefing — assemble on-read from Phases 1–4 + automation runs.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { AllocateChannelsForDayResult } from '@/lib/outreachChannelAllocation';
import { loadOutreachGoalDashboardSnapshot } from '@/lib/outreachGoalDashboard';
import { listOutreachLeads } from '@/lib/outreachLeadLists';
import { buildFollowUpQueue } from '@/lib/outreachFollowUpQueue';
import { loadActiveFollowUpSnoozes } from '@/lib/outreachFollowUpSnooze';
import {
  briefingSellingDate,
  getLatestOutreachAutomationRunForDate,
  getLatestRegionalOutreachPrepRun,
  getRegionalOutreachPrepRun,
  OUTREACH_MANUAL_REGIONAL_PREP_KIND,
  type OutreachAutomationRunRow,
} from '@/lib/outreachNightlyPrep';
import {
  normalizePrepCity,
  normalizePrepCrmRegion,
  prospectMatchesCrmRegion,
  prospectMatchesPrepCity,
} from '@/lib/geoCatalog';
import { formatOutreachPreparationDate, selectOutreachTargets } from '@/lib/outreachSelectTargets';
import type { OutreachPoolDiagnostics } from '@/lib/outreachBriefingShared';
import {
  formatRegionalPoolMessage,
  parseIdentifiedTargetsFromPrepAllocation,
  type OutreachAutomationRunPublic,
  type OutreachBriefingDraftRow,
  type OutreachBriefingDto,
} from '@/lib/outreachBriefingShared';

export type {
  OutreachAutomationRunPublic,
  OutreachBriefingDraftRow,
  OutreachBriefingDto,
  OutreachPoolDiagnostics,
} from '@/lib/outreachBriefingShared';
export { formatRegionalPoolMessage } from '@/lib/outreachBriefingShared';
import { AGENT_OUTREACH_PENDING_DRAFT_STATUSES } from '@/lib/outreachSelectionConstants';
import { resolveOutreachLeadRules } from '@/lib/resolveOutreachLeadRules';
import {
  fetchPendingAgentProductOutreachProspectIds,
  listAgentProductOutreachDrafts,
  SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH,
} from '@/lib/systemMessages';

type Client = SupabaseClient<Database>;

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
  const identified = run.selectedCount;
  switch (run.status) {
    case 'succeeded':
      if (run.reason === 'already_at_pace') {
        return {
          status: 'succeeded',
          message: "Pending drafts already meet today's pace.",
        };
      }
      if (run.reason === 'open_batch_full') {
        return {
          status: 'succeeded',
          message: `${run.pendingBefore} pending draft${run.pendingBefore === 1 ? '' : 's'} still open for this region — finish or send them before running prep again.`,
        };
      }
      if (run.kind === OUTREACH_MANUAL_REGIONAL_PREP_KIND && identified > 0 && n === 0) {
        return {
          status: 'succeeded',
          message: `${identified} account${identified === 1 ? '' : 's'} identified for outreach — research emails, then re-run prep to draft.`,
        };
      }
      if (run.kind === OUTREACH_MANUAL_REGIONAL_PREP_KIND && identified > n) {
        const needResearch = identified - n;
        return {
          status: 'succeeded',
          message: `${identified} identified · ${n} draft${n === 1 ? '' : 's'} ready · ${needResearch} need email research`,
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
    .select('prospect_id, open_count, click_count, last_opened_at, last_clicked_at, to_name')
    .eq('message_type', SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH)
    .or(`last_clicked_at.gte.${sinceIso},last_opened_at.gte.${sinceIso}`)
    .order('last_engagement_received_at', { ascending: false, nullsFirst: false })
    .limit(100);

  if (error || !data) return [];

  const byProspect = new Map<
    number,
    {
      prospectName: string;
      lastEngagedAt: string;
      openCount: number;
      clickCount: number;
    }
  >();

  for (const row of data) {
    if (row.prospect_id == null) continue;
    const lastOpened =
      row.last_opened_at && row.last_opened_at >= sinceIso ? row.last_opened_at : null;
    const lastClicked =
      row.last_clicked_at && row.last_clicked_at >= sinceIso ? row.last_clicked_at : null;
    if (!lastOpened && !lastClicked) continue;

    const lastEngagedAt =
      lastOpened && lastClicked
        ? lastOpened > lastClicked
          ? lastOpened
          : lastClicked
        : (lastClicked ?? lastOpened!);

    const prev = byProspect.get(row.prospect_id);
    const openCount = Math.max(prev?.openCount ?? 0, row.open_count ?? 0);
    const clickCount = Math.max(prev?.clickCount ?? 0, row.click_count ?? 0);
    const nextEngaged =
      !prev || lastEngagedAt > prev.lastEngagedAt ? lastEngagedAt : prev.lastEngagedAt;
    byProspect.set(row.prospect_id, {
      prospectName: (row.to_name ?? '').trim() || `Prospect #${row.prospect_id}`,
      lastEngagedAt: nextEngaged,
      openCount,
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
    .sort((a, b) => b.lastEngagedAt.localeCompare(a.lastEngagedAt))
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
  /** When set, prep banner + drafts use this regional scope instead of latest run. */
  regionalPrepScope?: {
    operationalTerritoryId: string;
    storeTerritoryCode?: string | null;
    crmRegion?: string | null;
    city?: string | null;
  };
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
      identifiedTargets: [],
      channelAllocation: null,
      callToday: [],
      hot: [],
      warm: [],
      followUps: [],
      recentEngagement: [],
      recentConversions: [],
      performance: null,
      leadRules: { source: 'provisional', version: 'v1-provisional', adjustedFields: [] },
      adaptiveWeightsEnabled: true,
      regionalPool: null,
    };
    return { ok: true, briefing: empty };
  }

  const snap = await loadOutreachGoalDashboardSnapshot({ client, asOf });
  if (!snap.ok) return { ok: false, error: snap.error };

  const timeZone = snap.snapshot.settings.businessTimezone;
  const asOfDate = formatOutreachPreparationDate(asOf, timeZone);
  const sellingDate = briefingSellingDate(asOf, timeZone);

  const runLookup = params.regionalPrepScope?.operationalTerritoryId
    ? await getRegionalOutreachPrepRun(client, {
        runDate: sellingDate,
        operationalTerritoryId: params.regionalPrepScope.operationalTerritoryId,
        storeTerritoryCode: params.regionalPrepScope.storeTerritoryCode,
        crmRegion: params.regionalPrepScope.crmRegion,
        city: params.regionalPrepScope.city,
      })
    : await getLatestOutreachAutomationRunForDate(client, sellingDate);
  if (!runLookup.ok) return { ok: false, error: runLookup.error };
  const run = runLookup.run;
  const banner = prepBannerMessage({ sellingDate, run });

  const scopedCrmRegion = normalizePrepCrmRegion(params.regionalPrepScope?.crmRegion);
  const scopedPrepCity = normalizePrepCity(params.regionalPrepScope?.city);

  let regionalPool: OutreachPoolDiagnostics | null = null;
  if (
    params.regionalPrepScope?.operationalTerritoryId &&
    (scopedCrmRegion || scopedPrepCity) &&
    params.regionalPrepScope.storeTerritoryCode
  ) {
    const poolDiag = await selectOutreachTargets(client, {
      preparationDate: sellingDate,
      capacity: 0,
      includeDiagnostics: true,
      operationalTerritoryId: params.regionalPrepScope.operationalTerritoryId,
      storeTerritoryCode: params.regionalPrepScope.storeTerritoryCode,
      crmRegion: scopedCrmRegion ?? undefined,
      city: scopedPrepCity ?? undefined,
      rankMode: 'fit_score',
      skipChannelAllocation: true,
      allowMissingEmail: true,
      asOf,
    });
    if (poolDiag.ok && poolDiag.diagnostics) {
      regionalPool = poolDiag.diagnostics;
    }
  }

  // Keep unfinished prep drafts mounted across selling dates (carryover until send).
  const draftsListed = await listAgentProductOutreachDrafts(client, {
    statuses: [...AGENT_OUTREACH_PENDING_DRAFT_STATUSES],
    prepScope: true,
    limit: 100,
  });
  if (!draftsListed.ok) return { ok: false, error: draftsListed.error };

  const drafts: OutreachBriefingDraftRow[] = draftsListed.drafts.map((d) => {
    const preparationDate = d.payload.generation?.preparationDate?.trim() || null;
    return {
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
      preparationDate,
      fromEarlierPrep: Boolean(preparationDate && preparationDate !== sellingDate),
    };
  });

  // Enrich prospect names
  const draftProspectIds = [...new Set(drafts.map((d) => d.prospectId))];
  let filteredDrafts = drafts;
  if (draftProspectIds.length > 0) {
    const { data: names } = await client
      .from('prospects')
      .select('id, name, account_status, region, city')
      .in('id', draftProspectIds);
    const prospectById = new Map((names ?? []).map((p) => [p.id, p] as const));
    for (const d of drafts) {
      const prospect = prospectById.get(d.prospectId);
      const name = prospect?.name?.trim();
      if (name) d.prospectName = name;
      if (prospect?.account_status) d.accountStatus = prospect.account_status;
    }
    if (scopedCrmRegion || scopedPrepCity) {
      const storeCode = params.regionalPrepScope?.storeTerritoryCode?.trim().toLowerCase() || null;
      filteredDrafts = drafts.filter((d) => {
        const prospect = prospectById.get(d.prospectId);
        if (!prospect) return false;
        if (
          scopedCrmRegion &&
          !prospectMatchesCrmRegion(prospect.region ?? '', scopedCrmRegion, storeCode)
        ) {
          return false;
        }
        if (!prospectMatchesPrepCity(prospect.city, scopedPrepCity)) {
          return false;
        }
        return true;
      });
    }
  }

  const pendingDraftProspectIds = new Set(filteredDrafts.map((d) => d.prospectId));

  let identifiedSourceRun = run;
  if (params.regionalPrepScope?.operationalTerritoryId) {
    const latestRegional = await getLatestRegionalOutreachPrepRun(client, {
      operationalTerritoryId: params.regionalPrepScope.operationalTerritoryId,
      storeTerritoryCode: params.regionalPrepScope.storeTerritoryCode,
      crmRegion: params.regionalPrepScope.crmRegion,
      city: params.regionalPrepScope.city,
    });
    if (!latestRegional.ok) return { ok: false, error: latestRegional.error };
    if (latestRegional.run) identifiedSourceRun = latestRegional.run;
  }

  const identifiedTargets = parseIdentifiedTargetsFromPrepAllocation(
    identifiedSourceRun?.channelAllocation,
  ).filter((t) => t.needsEmail && !pendingDraftProspectIds.has(t.prospectId));

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

  const [allLeads, pendingDrafts, recentEngagement, recentConversions, snoozedProspectIds] =
    await Promise.all([
      listOutreachLeads(client, { asOf, rules: resolvedLeadRules.rules }),
      fetchPendingAgentProductOutreachProspectIds(client, AGENT_OUTREACH_PENDING_DRAFT_STATUSES),
      loadRecentEngagement(client, since),
      loadRecentConversions(client, since),
      loadActiveFollowUpSnoozes(client, { asOf }),
    ]);
  if (!pendingDrafts.ok) return { ok: false, error: pendingDrafts.error };

  const productIds = [
    ...new Set(
      allLeads
        .map((row) => row.lastEngagedCatalogItemId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
  const productNamesById = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: catalogRows } = await client
      .from('catalog_items')
      .select('id, name')
      .in('id', productIds);
    for (const row of catalogRows ?? []) {
      if (row.name?.trim()) productNamesById.set(row.id, row.name.trim());
    }
  }

  const followUps = buildFollowUpQueue({
    leads: allLeads,
    pendingProspectIds: pendingDrafts.prospectIds,
    snoozedProspectIds,
    productNamesById,
    asOf,
    rules: resolvedLeadRules.rules,
  });
  const callToday = allLeads.filter((row) => row.callToday);
  const hot = allLeads.filter((row) => row.leadState === 'hot');
  const warm = allLeads.filter((row) => row.leadState === 'warm');

  const prepMessage =
    regionalPool && banner.status === 'empty_pool' && scopedCrmRegion
      ? formatRegionalPoolMessage(regionalPool, scopedCrmRegion)
      : banner.message;

  const briefing: OutreachBriefingDto = {
    asOfDate,
    sellingDate,
    prep: {
      run: run ? toPublicRun(run) : null,
      status: banner.status,
      message: prepMessage,
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
    drafts: filteredDrafts,
    identifiedTargets,
    channelAllocation,
    callToday,
    hot,
    warm,
    followUps,
    recentEngagement,
    recentConversions,
    performance: snap.snapshot.performance,
    leadRules: {
      source: resolvedLeadRules.source,
      version: resolvedLeadRules.rules.version,
      adjustedFields: resolvedLeadRules.meta.adjustedFields,
    },
    adaptiveWeightsEnabled: snap.snapshot.settings.adaptiveWeightsEnabled,
    regionalPool,
  };

  return { ok: true, briefing };
}
