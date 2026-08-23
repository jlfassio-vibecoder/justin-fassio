/**
 * Phase 4 conversion attribution: staff-confirmed preferred, last-touch fallback.
 * Snapshots lead state + rulesVersion at convert so later rule retunes do not rewrite history.
 * Limitation: Gmail last_message_at is cache-at-confirm (Phase 3) — same for reply signals.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AccountConversionAttributionInsert,
  AttributionModel,
  ConversionSource,
  Database,
} from '@/types/database';
import { getOutreachGoalSettings } from '@/lib/outreachGoals';
import {
  getOutreachLeadForProspect,
  loadUniqueContactEmailsForProspect,
} from '@/lib/outreachLeadLists';
import { resolveOutreachLeadRules } from '@/lib/resolveOutreachLeadRules';
import {
  normalizeSystemMessageEmail,
  parseGenerationMeta,
  type ProductOutreachGenerationMeta,
} from '@/lib/systemMessages';
import { addCalendarDaysIso } from '@/lib/outreachSellingDays';
import { formatOutreachPreparationDate } from '@/lib/outreachSelectTargets';
import { supabase } from '@/lib/supabase';

type Client = SupabaseClient<Database>;

export type LinkedOutreachCandidate = {
  id: string;
  sentAt: string;
  toEmail: string;
  catalogItemId: string | null;
  productName: string | null;
  productSku: string | null;
  origin: string;
  primaryChannel: string | null;
  generation: ProductOutreachGenerationMeta | null;
};

const CANDIDATE_SELECT =
  'id, prospect_id, to_email, catalog_item_id, sent_at, origin, payload, account_contact_id';

function payloadProduct(payload: unknown): {
  name: string | null;
  sku: string | null;
  generation: ProductOutreachGenerationMeta | null;
} {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { name: null, sku: null, generation: null };
  }
  const p = payload as Record<string, unknown>;
  const generation = parseGenerationMeta(p.generation) ?? null;
  return {
    name: typeof p.name === 'string' ? p.name : null,
    sku: typeof p.sku === 'string' ? p.sku : null,
    generation,
  };
}

/** Pure: pick last-touch message before convertedAt within window. */
export function pickLastTouchMessage(params: {
  messages: Array<{ id: string; sent_at: string | null }>;
  convertedAt: string;
  windowStartIso: string;
}): { id: string; sent_at: string } | null {
  const convertedMs = Date.parse(params.convertedAt);
  const windowStartMs = Date.parse(params.windowStartIso);
  let best: { id: string; sent_at: string; ms: number } | null = null;
  for (const m of params.messages) {
    if (!m.sent_at) continue;
    const ms = Date.parse(m.sent_at);
    if (!Number.isFinite(ms)) continue;
    if (ms > convertedMs) continue;
    if (Number.isFinite(windowStartMs) && ms < windowStartMs) continue;
    if (!best || ms > best.ms || (ms === best.ms && m.id > best.id)) {
      best = { id: m.id, sent_at: m.sent_at, ms };
    }
  }
  return best ? { id: best.id, sent_at: best.sent_at } : null;
}

/** Resolve attribution model when staff picks a message or None. */
export function resolveAttributionChoice(params: {
  staffSelectedMessageId: string | null | undefined;
  lastTouchId: string | null;
}): { model: AttributionModel; attributedSystemMessageId: string | null } {
  const selected = params.staffSelectedMessageId?.trim() || null;
  if (selected) {
    return { model: 'staff_confirmed', attributedSystemMessageId: selected };
  }
  if (params.lastTouchId) {
    return { model: 'last_touch_inferred', attributedSystemMessageId: params.lastTouchId };
  }
  return { model: 'none', attributedSystemMessageId: null };
}

export async function listLinkedOutreachCandidates(params: {
  client?: Client;
  prospectId: number;
  convertedAt?: string;
  lastTouchWindowDays?: number;
  timeZone?: string;
}): Promise<{ ok: true; candidates: LinkedOutreachCandidate[] } | { ok: false; error: string }> {
  const client = params.client ?? supabase;
  const convertedAt = params.convertedAt ?? new Date().toISOString();
  let windowDays = params.lastTouchWindowDays;
  let timeZone = params.timeZone;
  if (windowDays == null || !timeZone) {
    const goals = await getOutreachGoalSettings(client);
    if (!goals.ok) return { ok: false, error: goals.error };
    windowDays = windowDays ?? goals.settings.lastTouchWindowDays;
    timeZone = timeZone ?? goals.settings.businessTimezone;
  }

  const convertDate = formatOutreachPreparationDate(new Date(convertedAt), timeZone);
  const windowStartDate = addCalendarDaysIso(convertDate, -windowDays);
  const windowStartIso = `${windowStartDate}T00:00:00.000Z`;

  const { data: linked, error: linkedErr } = await client
    .from('system_messages')
    .select(CANDIDATE_SELECT)
    .eq('message_type', 'product_outreach')
    .eq('prospect_id', params.prospectId)
    .not('sent_at', 'is', null)
    .gte('sent_at', windowStartIso)
    .lte('sent_at', convertedAt)
    .order('sent_at', { ascending: false });
  if (linkedErr) return { ok: false, error: linkedErr.message };

  let unlinked: typeof linked = [];
  try {
    const emails = await loadUniqueContactEmailsForProspect({
      client,
      prospectId: params.prospectId,
    });
    if (emails.length > 0) {
      const { data: manuals, error: manErr } = await client
        .from('system_messages')
        .select(CANDIDATE_SELECT)
        .eq('message_type', 'product_outreach')
        .is('prospect_id', null)
        .not('sent_at', 'is', null)
        .in('to_email', emails)
        .gte('sent_at', windowStartIso)
        .lte('sent_at', convertedAt)
        .order('sent_at', { ascending: false });
      if (manErr) return { ok: false, error: manErr.message };
      unlinked = manuals ?? [];
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load contacts' };
  }

  const linkedIds = new Set((linked ?? []).map((r) => r.id));
  const rows = [...(linked ?? []), ...(unlinked ?? []).filter((r) => !linkedIds.has(r.id))];
  rows.sort((a, b) => {
    const aAt = a.sent_at ?? '';
    const bAt = b.sent_at ?? '';
    return aAt < bAt ? 1 : aAt > bAt ? -1 : 0;
  });

  const candidates: LinkedOutreachCandidate[] = rows.map((row) => {
    const product = payloadProduct(row.payload);
    return {
      id: row.id,
      sentAt: row.sent_at as string,
      toEmail: row.to_email,
      catalogItemId: row.catalog_item_id,
      productName: product.name,
      productSku: product.sku,
      origin: row.origin,
      primaryChannel: product.generation?.primaryChannel ?? null,
      generation: product.generation,
    };
  });

  return { ok: true, candidates };
}

export type RecordConversionAttributionInput = {
  prospectId: number;
  convertedAt: string;
  convertedBy?: string | null;
  conversionSource: ConversionSource;
  /** Staff radio selection; null/undefined = None (may still last-touch infer). */
  staffSelectedMessageId?: string | null;
  /** When true and staff selected None, do not infer last-touch. */
  forceNone?: boolean;
  client?: Client;
  retailerLineAccountId?: string | null;
};

export async function recordConversionAttribution(
  input: RecordConversionAttributionInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const client = input.client ?? supabase;
  const goals = await getOutreachGoalSettings(client);
  if (!goals.ok) return { ok: false, error: goals.error };

  const listed = await listLinkedOutreachCandidates({
    client,
    prospectId: input.prospectId,
    convertedAt: input.convertedAt,
    lastTouchWindowDays: goals.settings.lastTouchWindowDays,
    timeZone: goals.settings.businessTimezone,
  });
  if (!listed.ok) return { ok: false, error: listed.error };

  const convertDate = formatOutreachPreparationDate(
    new Date(input.convertedAt),
    goals.settings.businessTimezone,
  );
  const windowStartDate = addCalendarDaysIso(convertDate, -goals.settings.lastTouchWindowDays);
  const lastTouch = pickLastTouchMessage({
    messages: listed.candidates.map((c) => ({ id: c.id, sent_at: c.sentAt })),
    convertedAt: input.convertedAt,
    windowStartIso: `${windowStartDate}T00:00:00.000Z`,
  });

  const choice = input.forceNone
    ? { model: 'none' as const, attributedSystemMessageId: null }
    : resolveAttributionChoice({
        staffSelectedMessageId: input.staffSelectedMessageId,
        lastTouchId: lastTouch?.id ?? null,
      });

  const attributed =
    choice.attributedSystemMessageId != null
      ? (listed.candidates.find((c) => c.id === choice.attributedSystemMessageId) ?? null)
      : null;

  let primaryChannel = attributed?.primaryChannel ?? null;
  let priority = attributed?.generation?.selectionReasons.priority ?? null;
  let fitScore = attributed?.generation?.selectionReasons.fitScore ?? null;
  const productFit = attributed?.generation?.selectionReasons.productFit ?? null;
  const channelMatch = attributed?.generation?.selectionReasons.channelMatch ?? null;

  const { data: prospectRow } = await client
    .from('prospects')
    .select('category, priority, fit_score')
    .eq('id', input.prospectId)
    .maybeSingle();

  if (!primaryChannel && prospectRow?.category) {
    primaryChannel = prospectRow.category;
  }
  if (priority == null && prospectRow?.priority != null) {
    priority = prospectRow.priority;
  }
  if (fitScore == null && prospectRow?.fit_score != null) {
    fitScore = Number(prospectRow.fit_score);
  }

  let leadState: 'cold' | 'warm' | 'hot' | null = null;
  let leadScore: number | null = null;
  let rulesVersion: string | null = null;
  let engagementSnapshot: Record<string, unknown> = {};
  try {
    const convertedAt = new Date(input.convertedAt);
    const resolvedRules = await resolveOutreachLeadRules({ client, asOf: convertedAt });
    const lead = await getOutreachLeadForProspect({
      client,
      prospectId: input.prospectId,
      asOf: convertedAt,
      rules: resolvedRules.rules,
    });
    if (lead) {
      leadState = lead.leadState;
      leadScore = lead.score;
      rulesVersion = lead.rulesVersion;
      engagementSnapshot = {
        emailsSent: lead.engagement.emailsSent,
        openCount: lead.engagement.openCount,
        clickCount: lead.engagement.clickCount,
        replyAttributed: lead.engagement.reply.attributed,
      };
    }
  } catch {
    // Lead snapshot is best-effort; conversion must still succeed.
  }

  const row: AccountConversionAttributionInsert = {
    prospect_id: input.prospectId,
    converted_at: input.convertedAt,
    converted_by: input.convertedBy ?? null,
    conversion_source: input.conversionSource,
    attribution_model: choice.model,
    attributed_system_message_id: choice.attributedSystemMessageId,
    contributing_system_message_ids: listed.candidates.map((c) => c.id),
    catalog_item_id: attributed?.catalogItemId ?? null,
    message_origin: attributed?.origin ?? null,
    primary_channel: primaryChannel,
    priority,
    fit_score: fitScore,
    product_fit: productFit,
    channel_match: channelMatch,
    lead_state: leadState,
    lead_score: leadScore,
    rules_version: rulesVersion,
    snapshot: {
      selectionReasons: attributed?.generation?.selectionReasons ?? null,
      engagement: engagementSnapshot,
      productName: attributed?.productName ?? null,
      productSku: attributed?.productSku ?? null,
    },
    ...(input.retailerLineAccountId
      ? { retailer_line_account_id: input.retailerLineAccountId }
      : {}),
  };

  const { data, error } = await client
    .from('account_conversion_attribution')
    .insert(row)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Failed to insert attribution' };
  return { ok: true, id: data.id };
}

/**
 * Best-effort backfill for recent active accounts missing attribution rows.
 * Never overwrites staff_confirmed. Staff-triggered only.
 */
export async function backfillRecentConversionAttribution(params: {
  client?: Client;
  lookbackDays?: number;
  asOf?: Date;
}): Promise<{ ok: true; inserted: number; skipped: number } | { ok: false; error: string }> {
  const client = params.client ?? supabase;
  const goals = await getOutreachGoalSettings(client);
  if (!goals.ok) return { ok: false, error: goals.error };

  const lookbackDays = params.lookbackDays ?? goals.settings.lookbackDays;
  const asOf = params.asOf ?? new Date();
  const today = formatOutreachPreparationDate(asOf, goals.settings.businessTimezone);
  const startDate = addCalendarDaysIso(today, -lookbackDays);
  const startIso = `${startDate}T00:00:00.000Z`;

  const { data: ogr, error: ogrErr } = await client
    .from('lines')
    .select('id')
    .eq('code', 'ogr')
    .maybeSingle();
  if (ogrErr) return { ok: false, error: ogrErr.message };
  if (!ogr) return { ok: false, error: 'OGR sales line not found' };

  const { data: converts, error: convErr } = await client
    .from('retailer_line_accounts')
    .select('retailer_id, converted_at')
    .eq('sales_line_id', ogr.id)
    .eq('relationship_status', 'opened')
    .not('converted_at', 'is', null)
    .gte('converted_at', startIso);
  if (convErr) return { ok: false, error: convErr.message };

  const { data: existing, error: existErr } = await client
    .from('account_conversion_attribution')
    .select('prospect_id, converted_at')
    .gte('converted_at', startIso);
  if (existErr) return { ok: false, error: existErr.message };

  const existingKeys = new Set((existing ?? []).map((r) => `${r.prospect_id}|${r.converted_at}`));

  let inserted = 0;
  let skipped = 0;
  for (const row of converts ?? []) {
    if (!row.converted_at) continue;
    const key = `${row.retailer_id}|${row.converted_at}`;
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    const result = await recordConversionAttribution({
      client,
      prospectId: row.retailer_id,
      convertedAt: row.converted_at,
      conversionSource: 'manual',
      staffSelectedMessageId: null,
      forceNone: false,
    });
    if (result.ok) {
      inserted += 1;
      existingKeys.add(key);
    } else {
      skipped += 1;
    }
  }

  return { ok: true, inserted, skipped };
}

/** Count MTD active-account conversions in business TZ month. */
export async function countMtdActiveAccountConversions(params: {
  client?: Client;
  monthStartIso: string;
  monthEndExclusiveIso: string;
}): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const client = params.client ?? supabase;
  const { data: ogr, error: ogrErr } = await client
    .from('lines')
    .select('id')
    .eq('code', 'ogr')
    .maybeSingle();
  if (ogrErr) return { ok: false, error: ogrErr.message };
  if (!ogr) return { ok: false, error: 'OGR sales line not found' };
  const { data, error } = await client
    .from('retailer_line_accounts')
    .select('retailer_id')
    .eq('sales_line_id', ogr.id)
    .eq('relationship_status', 'opened')
    .gte('converted_at', params.monthStartIso)
    .lt('converted_at', params.monthEndExclusiveIso);
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: (data ?? []).length };
}

/** Attributed conversion count + distinct outreach prospects in lookback (for pace). */
export async function loadAttributionCohortStats(params: {
  client?: Client;
  lookbackStartIso: string;
  asOfIso?: string;
}): Promise<
  | { ok: true; attributedConversions: number; outreachProspects: number }
  | { ok: false; error: string }
> {
  const client = params.client ?? supabase;
  const asOfIso = params.asOfIso ?? new Date().toISOString();

  const { data: attrs, error: attrErr } = await client
    .from('account_conversion_attribution')
    .select('id, attribution_model, attributed_system_message_id, converted_at')
    .gte('converted_at', params.lookbackStartIso)
    .lte('converted_at', asOfIso);
  if (attrErr) return { ok: false, error: attrErr.message };

  const attributedConversions = (attrs ?? []).filter(
    (r) =>
      (r.attribution_model === 'staff_confirmed' ||
        r.attribution_model === 'last_touch_inferred') &&
      r.attributed_system_message_id != null,
  ).length;

  const { data: sends, error: sendErr } = await client
    .from('system_messages')
    .select('prospect_id, to_email')
    .eq('message_type', 'product_outreach')
    .not('sent_at', 'is', null)
    .gte('sent_at', params.lookbackStartIso)
    .lte('sent_at', asOfIso);
  if (sendErr) return { ok: false, error: sendErr.message };

  const prospectIds = new Set<number>();
  for (const row of sends ?? []) {
    if (typeof row.prospect_id === 'number' && Number.isFinite(row.prospect_id)) {
      prospectIds.add(row.prospect_id);
    }
  }

  // Unique-email fold-in for null prospect_id rows
  const nullEmails = [
    ...new Set(
      (sends ?? [])
        .filter((r) => r.prospect_id == null)
        .map((r) => normalizeSystemMessageEmail(r.to_email))
        .filter((e) => e.length > 0),
    ),
  ];
  if (nullEmails.length > 0) {
    const { data: contacts } = await client
      .from('account_contacts')
      .select('account_id, email')
      .in('email', nullEmails);
    const emailCounts = new Map<string, Set<number>>();
    for (const c of contacts ?? []) {
      if (typeof c.email !== 'string' || typeof c.account_id !== 'number') continue;
      const email = normalizeSystemMessageEmail(c.email);
      const set = emailCounts.get(email) ?? new Set<number>();
      set.add(c.account_id);
      emailCounts.set(email, set);
    }
    for (const email of nullEmails) {
      const set = emailCounts.get(email);
      if (set && set.size === 1) {
        const only = [...set][0];
        if (only != null) prospectIds.add(only);
      }
    }
  }

  return {
    ok: true,
    attributedConversions,
    outreachProspects: prospectIds.size,
  };
}
