/**
 * Phase 5 Daily Agent Briefing — assemble on-read from Phases 1–4 + automation runs.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import {
  ACCOUNT_CONTACT_SELECT,
  mapAccountContactRow,
  type AccountContact,
} from '@/lib/accountContacts';
import type { AllocateChannelsForDayResult } from '@/lib/outreachChannelAllocation';
import { loadOutreachGoalDashboardSnapshot } from '@/lib/outreachGoalDashboard';
import { listOutreachLeads, type OutreachLeadRow } from '@/lib/outreachLeadLists';
import { buildFollowUpQueue } from '@/lib/outreachFollowUpQueue';
import { loadActiveFollowUpSnoozes } from '@/lib/outreachFollowUpSnooze';
import { loadResearchQueueDismissals } from '@/lib/outreachResearchQueueDismiss';
import {
  briefingSellingDate,
  getLatestOutreachAutomationRunForDate,
  getLatestRegionalOutreachPrepRun,
  getRegionalOutreachPrepRun,
  isRegionalPrepKind,
  type OutreachAutomationRunRow,
} from '@/lib/outreachNightlyPrep';
import {
  normalizePrepCity,
  normalizePrepCrmRegion,
  prospectMatchesCrmRegion,
  prospectMatchesPrepCity,
} from '@/lib/geoCatalog';
import {
  normalizePrepChannel,
  prospectMatchesPrepChannel,
  type PrimaryRetailChannel,
} from '@/lib/crmRetailTaxonomy';
import { formatOutreachPreparationDate, selectOutreachTargets } from '@/lib/outreachSelectTargets';
import { isWithinOutreachCooldown, pickOutreachContact } from '@/lib/outreachEligibility';
import { loadActiveSitePresence, mergeSitePresenceIntoCallToday } from '@/lib/sitePresenceBriefing';
import {
  latestProspectOutreachSentAt,
  loadLatestProductOutreachSends,
} from '@/lib/outreachLatestSends';
import { isActiveAccountStatus, loadResolvedAccountStatusByIds } from '@/lib/outreachAccountStatus';
import type {
  OutreachAccountAudience,
  OutreachPoolDiagnostics,
} from '@/lib/outreachBriefingShared';
import {
  formatRegionalPoolMessage,
  parseIdentifiedTargetsFromPrepAllocation,
  TOP_LEADS_DTO_LIMIT,
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
import {
  AGENT_OUTREACH_COOLDOWN_DAYS,
  AGENT_OUTREACH_PENDING_DRAFT_STATUSES,
} from '@/lib/outreachSelectionConstants';
import { resolveOutreachLeadRules } from '@/lib/resolveOutreachLeadRules';
import {
  escapeIlikeExact,
  fetchPendingAgentProductOutreachProspectIds,
  listAgentProductOutreachDrafts,
  normalizeSystemMessageEmail,
  SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH,
} from '@/lib/systemMessages';

type Client = SupabaseClient<Database>;

/**
 * Live outreach contact email by prospect id (pickOutreachContact).
 * Used for Research Queue hasUsableEmail + shared-store notices.
 */
export async function loadUsableOutreachEmailsByProspectId(
  client: Client,
  prospectIds: number[],
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const ids = [...new Set(prospectIds)];
  if (ids.length === 0) return out;

  const { data, error } = await client
    .from('account_contacts')
    .select(ACCOUNT_CONTACT_SELECT)
    .in('account_id', ids);
  if (error) throw new Error(error.message);

  const byAccount = new Map<number, AccountContact[]>();
  for (const row of data ?? []) {
    const contact = mapAccountContactRow(row);
    const list = byAccount.get(contact.accountId) ?? [];
    list.push(contact);
    byAccount.set(contact.accountId, list);
  }
  for (const [accountId, contacts] of byAccount) {
    const picked = pickOutreachContact(contacts);
    if (picked) out.set(accountId, picked.toEmail);
  }
  return out;
}

/**
 * Other store names that share each prospect's usable outreach email (multi-location owners).
 */
export async function loadSharedEmailStoreNamesByProspectId(
  client: Client,
  emailsByProspect: Map<number, string>,
): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (emailsByProspect.size === 0) return out;

  const emails = [...new Set([...emailsByProspect.values()].map(normalizeSystemMessageEmail))];
  if (emails.length === 0) return out;

  const orFilter = emails.map((e) => `email.ilike.${escapeIlikeExact(e)}`).join(',');
  const { data: contactRows, error: contactError } = await client
    .from('account_contacts')
    .select('account_id, email')
    .or(orFilter);
  if (contactError) throw new Error(contactError.message);

  const emailToAccountIds = new Map<string, Set<number>>();
  const accountIds = new Set<number>();
  for (const row of contactRows ?? []) {
    if (typeof row.account_id !== 'number' || typeof row.email !== 'string') continue;
    const email = normalizeSystemMessageEmail(row.email);
    if (!emails.includes(email)) continue;
    const set = emailToAccountIds.get(email) ?? new Set<number>();
    set.add(row.account_id);
    emailToAccountIds.set(email, set);
    accountIds.add(row.account_id);
  }
  if (accountIds.size === 0) return out;

  const { data: prospectRows, error: prospectError } = await client
    .from('prospects')
    .select('id, name')
    .in('id', [...accountIds]);
  if (prospectError) throw new Error(prospectError.message);

  const nameById = new Map<number, string>();
  for (const row of prospectRows ?? []) {
    if (typeof row.id === 'number' && typeof row.name === 'string' && row.name.trim()) {
      nameById.set(row.id, row.name.trim());
    }
  }

  for (const [prospectId, emailRaw] of emailsByProspect) {
    const email = normalizeSystemMessageEmail(emailRaw);
    const siblings = emailToAccountIds.get(email);
    if (!siblings) continue;
    const names = [...siblings]
      .filter((id) => id !== prospectId)
      .map((id) => nameById.get(id))
      .filter((name): name is string => Boolean(name))
      .sort((a, b) => a.localeCompare(b));
    if (names.length > 0) out.set(prospectId, names);
  }
  return out;
}

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
      if (isRegionalPrepKind(run.kind) && identified > 0 && n === 0) {
        return {
          status: 'succeeded',
          message: `${identified} account${identified === 1 ? '' : 's'} identified for outreach — research emails, then re-run prep to draft.`,
        };
      }
      if (isRegionalPrepKind(run.kind) && identified > n) {
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

type RecentEngagementMessageRow = {
  prospect_id: number | null;
  open_count: number | null;
  click_count: number | null;
  last_opened_at: string | null;
  last_clicked_at: string | null;
  to_name: string | null;
};

/**
 * Fold product-outreach messages into per-prospect Engaged counts.
 * Sums opens/clicks across messages (same math as Phase 3 lead aggregation).
 * Exported for unit tests.
 */
export function foldRecentEngagementMessages(
  rows: RecentEngagementMessageRow[],
  sinceIso: string,
): Map<
  number,
  {
    prospectName: string;
    lastEngagedAt: string;
    openCount: number;
    clickCount: number;
  }
> {
  const byProspect = new Map<
    number,
    {
      prospectName: string;
      lastEngagedAt: string;
      openCount: number;
      clickCount: number;
    }
  >();

  for (const row of rows) {
    if (row.prospect_id == null) continue;
    const lastOpened =
      row.last_opened_at && row.last_opened_at >= sinceIso ? row.last_opened_at : null;
    const lastClicked =
      row.last_clicked_at && row.last_clicked_at >= sinceIso ? row.last_clicked_at : null;
    if (!lastOpened && !lastClicked) continue;

    const lastEngagedAt =
      lastClicked && lastOpened
        ? lastOpened > lastClicked
          ? lastOpened
          : lastClicked
        : (lastClicked ?? lastOpened);
    if (!lastEngagedAt) continue;

    const prev = byProspect.get(row.prospect_id);
    const openCount = (prev?.openCount ?? 0) + Math.max(0, row.open_count ?? 0);
    const clickCount = (prev?.clickCount ?? 0) + Math.max(0, row.click_count ?? 0);
    const nextEngaged =
      !prev || lastEngagedAt > prev.lastEngagedAt ? lastEngagedAt : prev.lastEngagedAt;
    byProspect.set(row.prospect_id, {
      prospectName: (row.to_name ?? '').trim() || `Prospect #${row.prospect_id}`,
      lastEngagedAt: nextEngaged,
      openCount,
      clickCount,
    });
  }

  return byProspect;
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

  const byProspect = foldRecentEngagementMessages(data, sinceIso);

  const prospectIds = [...byProspect.keys()];
  const statuses =
    prospectIds.length > 0 ? await loadResolvedAccountStatusByIds(client, prospectIds) : new Map();
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
    .map(([prospectId, v]) => ({
      prospectId,
      ...v,
      accountStatus: statuses.get(prospectId) ?? ('prospect' as const),
    }))
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

/**
 * Mirror draft regional filtering: when Briefing has crmRegion, city, and/or channel scope,
 * keep only leads whose prospect region/city/category match.
 */
export async function filterOutreachLeadsByPrepScope(params: {
  client: Client;
  leads: OutreachLeadRow[];
  crmRegion: string | null;
  city: string | null;
  channel?: PrimaryRetailChannel | null;
  storeTerritoryCode?: string | null;
  /** When set, skip the prospects lookup (reuse a preloaded region/city/category map). */
  regionCityById?: Map<
    number,
    { region: string | null; city: string | null; category: string | null }
  >;
}): Promise<OutreachLeadRow[]> {
  const { leads, crmRegion, city } = params;
  const channel = params.channel ?? null;
  if ((!crmRegion && !city && !channel) || leads.length === 0) return leads;

  const byId =
    params.regionCityById ??
    (await loadProspectRegionCityByIds(
      params.client,
      leads.map((l) => l.prospectId),
    ));
  const storeCode = params.storeTerritoryCode?.trim().toLowerCase() || null;

  return leads.filter((lead) => {
    const prospect = byId.get(lead.prospectId);
    if (!prospect) return false;
    if (crmRegion && !prospectMatchesCrmRegion(prospect.region ?? '', crmRegion, storeCode)) {
      return false;
    }
    if (!prospectMatchesPrepCity(prospect.city, city)) {
      return false;
    }
    if (!prospectMatchesPrepChannel(prospect.category, channel)) {
      return false;
    }
    return true;
  });
}

async function loadProspectRegionCityByIds(
  client: Client,
  prospectIds: number[],
): Promise<Map<number, { region: string | null; city: string | null; category: string | null }>> {
  const ids = [...new Set(prospectIds)];
  const out = new Map<
    number,
    { region: string | null; city: string | null; category: string | null }
  >();
  if (ids.length === 0) return out;
  const { data: rows, error } = await client
    .from('prospects')
    .select('id, region, city, category')
    .in('id', ids);
  if (error) throw new Error(error.message);
  for (const p of rows ?? []) {
    out.set(p.id, {
      region: p.region ?? null,
      city: p.city ?? null,
      category: p.category ?? null,
    });
  }
  return out;
}

function sortAndCapLeadRows(
  leads: OutreachLeadRow[],
  limit: number = TOP_LEADS_DTO_LIMIT,
): OutreachLeadRow[] {
  return [...leads]
    .sort((a, b) => b.score - a.score || a.prospectName.localeCompare(b.prospectName))
    .slice(0, limit);
}

function hasAttributedReply(lead: OutreachLeadRow): boolean {
  return lead.callTodayReasons.includes('attributed_reply');
}

function hasOnSite(lead: OutreachLeadRow): boolean {
  return lead.callTodayReasons.includes('on_site') || Boolean(lead.sitePresence?.active);
}

/** Call today: pin On site, then Replied, then score / name. */
function sortAndCapCallTodayRows(
  leads: OutreachLeadRow[],
  limit: number = TOP_LEADS_DTO_LIMIT,
): OutreachLeadRow[] {
  return [...leads]
    .sort((a, b) => {
      const onSiteDelta = Number(hasOnSite(b)) - Number(hasOnSite(a));
      if (onSiteDelta !== 0) return onSiteDelta;
      const replyDelta = Number(hasAttributedReply(b)) - Number(hasAttributedReply(a));
      if (replyDelta !== 0) return replyDelta;
      return b.score - a.score || a.prospectName.localeCompare(b.prospectName);
    })
    .slice(0, limit);
}

/** Sort, drop snoozed, and cap Call today / Hot / Warm for the Briefing DTO. */
export function prepareBriefingLeadLists(params: {
  leads: OutreachLeadRow[];
  snoozedProspectIds: ReadonlySet<number>;
  limit?: number;
}): {
  callToday: OutreachLeadRow[];
  hot: OutreachLeadRow[];
  warm: OutreachLeadRow[];
} {
  const limit = params.limit ?? TOP_LEADS_DTO_LIMIT;
  const unsnoozed = params.leads.filter((l) => !params.snoozedProspectIds.has(l.prospectId));
  return {
    callToday: sortAndCapCallTodayRows(
      unsnoozed.filter((l) => l.callToday),
      limit,
    ),
    hot: sortAndCapLeadRows(
      unsnoozed.filter((l) => l.leadState === 'hot'),
      limit,
    ),
    warm: sortAndCapLeadRows(
      unsnoozed.filter((l) => l.leadState === 'warm'),
      limit,
    ),
  };
}

export async function filterRecentEngagementByPrepScope(params: {
  client: Client;
  rows: OutreachBriefingDto['recentEngagement'];
  crmRegion: string | null;
  city: string | null;
  channel?: PrimaryRetailChannel | null;
  storeTerritoryCode?: string | null;
  /** When set, skip the prospects lookup (reuse a preloaded region/city/category map). */
  regionCityById?: Map<
    number,
    { region: string | null; city: string | null; category: string | null }
  >;
}): Promise<OutreachBriefingDto['recentEngagement']> {
  const { rows, crmRegion, city } = params;
  const channel = params.channel ?? null;
  if ((!crmRegion && !city && !channel) || rows.length === 0) return rows;

  const byId =
    params.regionCityById ??
    (await loadProspectRegionCityByIds(
      params.client,
      rows.map((r) => r.prospectId),
    ));
  const storeCode = params.storeTerritoryCode?.trim().toLowerCase() || null;

  return rows.filter((row) => {
    const prospect = byId.get(row.prospectId);
    if (!prospect) return false;
    if (crmRegion && !prospectMatchesCrmRegion(prospect.region ?? '', crmRegion, storeCode)) {
      return false;
    }
    if (!prospectMatchesPrepCity(prospect.city, city)) {
      return false;
    }
    if (!prospectMatchesPrepChannel(prospect.category, channel)) {
      return false;
    }
    return true;
  });
}

/** Drop ids already shown in Call today / Warm, keep recency order, cap. */
export function prepareRecentEngagementForBriefing(params: {
  rows: OutreachBriefingDto['recentEngagement'];
  excludeProspectIds: ReadonlySet<number>;
  limit?: number;
}): OutreachBriefingDto['recentEngagement'] {
  const limit = params.limit ?? TOP_LEADS_DTO_LIMIT;
  return params.rows
    .filter((r) => !params.excludeProspectIds.has(r.prospectId))
    .sort((a, b) => b.lastEngagedAt.localeCompare(a.lastEngagedAt))
    .slice(0, limit);
}

export async function assembleOutreachBriefing(params: {
  client: Client;
  asOf?: Date;
  /** Phase 2: when set to a non-OGR represented line, return empty book lists. */
  salesLineId?: string | null;
  salesLineCode?: string | null;
  /** Active Accounts embed: keep only active_account rows. Omitted = Daily mix. */
  accountAudience?: OutreachAccountAudience;
  /** When set, prep banner + drafts use this regional scope instead of latest run. */
  regionalPrepScope?: {
    operationalTerritoryId: string;
    storeTerritoryCode?: string | null;
    crmRegion?: string | null;
    city?: string | null;
    channel?: string | null;
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
        accountAudience: params.accountAudience,
      })
    : await getLatestOutreachAutomationRunForDate(client, sellingDate);
  if (!runLookup.ok) return { ok: false, error: runLookup.error };
  const run = runLookup.run;
  const banner = prepBannerMessage({ sellingDate, run });

  const scopedCrmRegion = normalizePrepCrmRegion(params.regionalPrepScope?.crmRegion);
  const scopedPrepCity = normalizePrepCity(params.regionalPrepScope?.city);
  const scopedChannel = normalizePrepChannel(params.regionalPrepScope?.channel);

  let regionalPool: OutreachPoolDiagnostics | null = null;
  if (
    params.regionalPrepScope?.operationalTerritoryId &&
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
      channel: scopedChannel ?? undefined,
      rankMode: 'fit_score',
      skipChannelAllocation: true,
      allowMissingEmail: true,
      asOf,
      accountAudience: params.accountAudience,
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
      .select('id, name, account_status, region, city, category')
      .in('id', draftProspectIds);
    const prospectById = new Map((names ?? []).map((p) => [p.id, p] as const));
    for (const d of drafts) {
      const prospect = prospectById.get(d.prospectId);
      const name = prospect?.name?.trim();
      if (name) d.prospectName = name;
      if (prospect?.account_status) d.accountStatus = prospect.account_status;
    }
    if (scopedCrmRegion || scopedPrepCity || scopedChannel) {
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
        const draftChannel = d.primaryChannel ?? prospect.category ?? null;
        if (!prospectMatchesPrepChannel(draftChannel, scopedChannel)) {
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
      accountAudience: params.accountAudience,
    });
    if (!latestRegional.ok) return { ok: false, error: latestRegional.error };
    if (latestRegional.run) identifiedSourceRun = latestRegional.run;
  }

  let researchQueueDismissals: Set<number>;
  try {
    researchQueueDismissals = await loadResearchQueueDismissals(client);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to load research queue dismissals',
    };
  }
  let identifiedTargets = parseIdentifiedTargetsFromPrepAllocation(
    identifiedSourceRun?.channelAllocation,
  ).filter(
    (t) =>
      t.needsEmail &&
      !pendingDraftProspectIds.has(t.prospectId) &&
      !researchQueueDismissals.has(t.prospectId) &&
      prospectMatchesPrepChannel(t.primaryChannel, scopedChannel),
  );

  if (identifiedTargets.length > 0) {
    let emailsByProspect: Map<number, string>;
    try {
      emailsByProspect = await loadUsableOutreachEmailsByProspectId(
        client,
        identifiedTargets.map((t) => t.prospectId),
      );
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to load research-queue contact emails',
      };
    }

    identifiedTargets = identifiedTargets.map((t) => ({
      ...t,
      hasUsableEmail: emailsByProspect.has(t.prospectId),
    }));

    const sends = await loadLatestProductOutreachSends(
      client,
      identifiedTargets.map((t) => t.prospectId),
    );
    if (!sends.ok) return { ok: false, error: sends.error };
    identifiedTargets = identifiedTargets.filter((t) => {
      const lastSentAt = latestProspectOutreachSentAt(t.prospectId, sends.byProspectId);
      return !isWithinOutreachCooldown(lastSentAt, {
        asOf,
        cooldownDays: AGENT_OUTREACH_COOLDOWN_DAYS,
      });
    });

    if (identifiedTargets.length > 0) {
      try {
        const sharedNames = await loadSharedEmailStoreNamesByProspectId(
          client,
          new Map(
            identifiedTargets
              .map((t) => {
                const email = emailsByProspect.get(t.prospectId);
                return email ? ([t.prospectId, email] as const) : null;
              })
              .filter((row): row is readonly [number, string] => row != null),
          ),
        );
        identifiedTargets = identifiedTargets.map((t) => ({
          ...t,
          sharedEmailStoreNames: sharedNames.get(t.prospectId) ?? [],
        }));
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to load shared-email store names',
        };
      }
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

  const [allLeads, pendingDrafts, recentEngagement, recentConversions, snoozedProspectIds] =
    await Promise.all([
      listOutreachLeads(client, { asOf, rules: resolvedLeadRules.rules }),
      fetchPendingAgentProductOutreachProspectIds(client, AGENT_OUTREACH_PENDING_DRAFT_STATUSES),
      loadRecentEngagement(client, since),
      loadRecentConversions(client, since),
      loadActiveFollowUpSnoozes(client, { asOf }),
    ]);
  if (!pendingDrafts.ok) return { ok: false, error: pendingDrafts.error };

  let scopedLeads = allLeads;
  let scopedEngagement = recentEngagement;
  if (scopedCrmRegion || scopedPrepCity || scopedChannel) {
    try {
      const regionCityById = await loadProspectRegionCityByIds(client, [
        ...allLeads.map((l) => l.prospectId),
        ...recentEngagement.map((r) => r.prospectId),
      ]);
      scopedLeads = await filterOutreachLeadsByPrepScope({
        client,
        leads: allLeads,
        crmRegion: scopedCrmRegion,
        city: scopedPrepCity,
        channel: scopedChannel,
        storeTerritoryCode: params.regionalPrepScope?.storeTerritoryCode,
        regionCityById,
      });
      scopedEngagement = await filterRecentEngagementByPrepScope({
        client,
        rows: recentEngagement,
        crmRegion: scopedCrmRegion,
        city: scopedPrepCity,
        channel: scopedChannel,
        storeTerritoryCode: params.regionalPrepScope?.storeTerritoryCode,
        regionCityById,
      });
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to filter briefing rows by region',
      };
    }
  }

  if (params.accountAudience === 'active_account') {
    scopedLeads = scopedLeads.filter((l) => l.accountStatus === 'active_account');
  }

  const productIds = [
    ...new Set(
      scopedLeads
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
    leads: scopedLeads,
    pendingProspectIds: pendingDrafts.prospectIds,
    snoozedProspectIds,
    productNamesById,
    asOf,
    rules: resolvedLeadRules.rules,
    accountAudience: params.accountAudience,
  });
  const prepared = prepareBriefingLeadLists({
    leads: scopedLeads,
    snoozedProspectIds,
  });

  const sitePresence = await loadActiveSitePresence(client, { asOf });
  let scopedPresence = sitePresence;
  if (scopedCrmRegion || scopedPrepCity || scopedChannel) {
    const presenceIds = sitePresence.map((p) => p.prospectId);
    const regionCityById =
      presenceIds.length > 0
        ? await loadProspectRegionCityByIds(client, presenceIds).catch(() => null)
        : null;
    if (regionCityById) {
      const storeCode = params.regionalPrepScope?.storeTerritoryCode?.trim().toLowerCase() || null;
      scopedPresence = sitePresence.filter((p) => {
        const geo = regionCityById.get(p.prospectId);
        if (!geo) return false;
        if (
          scopedCrmRegion &&
          !prospectMatchesCrmRegion(geo.region ?? '', scopedCrmRegion, storeCode)
        ) {
          return false;
        }
        if (!prospectMatchesPrepCity(geo.city, scopedPrepCity)) return false;
        if (!prospectMatchesPrepChannel(geo.category, scopedChannel)) return false;
        return true;
      });
    }
  }

  if (params.accountAudience === 'active_account') {
    try {
      const statusIds = [
        ...filteredDrafts.map((d) => d.prospectId),
        ...identifiedTargets.map((t) => t.prospectId),
        ...scopedEngagement.map((r) => r.prospectId),
        ...scopedPresence.map((p) => p.prospectId),
      ];
      const statuses = await loadResolvedAccountStatusByIds(client, statusIds);
      filteredDrafts = filteredDrafts.filter((d) =>
        isActiveAccountStatus(statuses.get(d.prospectId)),
      );
      identifiedTargets = identifiedTargets.filter((t) =>
        isActiveAccountStatus(statuses.get(t.prospectId)),
      );
      scopedEngagement = scopedEngagement.filter((r) =>
        isActiveAccountStatus(statuses.get(r.prospectId)),
      );
      scopedPresence = scopedPresence.filter((p) =>
        isActiveAccountStatus(statuses.get(p.prospectId)),
      );
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to filter briefing rows by audience',
      };
    }
  }

  const scopedLeadIds = new Set(scopedLeads.map((l) => l.prospectId));
  const presenceNameIds = scopedPresence
    .map((p) => p.prospectId)
    .filter((id) => !scopedLeadIds.has(id));
  const prospectNames = new Map<number, string>();
  for (const l of scopedLeads) prospectNames.set(l.prospectId, l.prospectName);
  if (presenceNameIds.length > 0) {
    const { data: nameRows } = await client
      .from('prospects')
      .select('id, name')
      .in('id', presenceNameIds);
    for (const row of nameRows ?? []) {
      if (row.name?.trim()) prospectNames.set(row.id, row.name.trim());
    }
  }

  const callTodayMerged = mergeSitePresenceIntoCallToday({
    callToday: prepared.callToday,
    allLeads: scopedLeads,
    presence: scopedPresence,
    prospectNames,
  });
  const { callToday, hot, warm } = {
    callToday: prepareBriefingLeadLists({
      leads: callTodayMerged.map((row) => ({ ...row, callToday: true })),
      snoozedProspectIds,
    }).callToday,
    hot: prepared.hot,
    warm: prepared.warm,
  };

  const excludeFromEngaged = new Set<number>([
    ...callToday.map((l) => l.prospectId),
    ...warm.map((l) => l.prospectId),
  ]);
  const filteredRecentEngagement = prepareRecentEngagementForBriefing({
    rows: scopedEngagement,
    excludeProspectIds: excludeFromEngaged,
  });

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
    recentEngagement: filteredRecentEngagement,
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
