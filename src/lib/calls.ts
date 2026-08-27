import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { buildUsdToCadOrderConversion, STAFF_USD_CAD_CONVERSION_SOURCE } from '@/lib/orders';
import { supabase } from '@/lib/supabase';
import { formatOutreachPreparationDate } from '@/lib/outreachSelectTargets';
import { AGENT_OUTREACH_PREP_TZ } from '@/lib/outreachSelectionConstants';

type Client = SupabaseClient<Database>;

export type CallOrderValueConversionStamp = {
  order_value_original_amount: number;
  order_value_original_currency: 'USD' | 'CAD';
  order_value_cad: number;
  order_value_exchange_rate: number;
  order_value_exchange_rate_date: string;
  order_value_conversion_source: string;
  order_value_converted_amount: number;
  order_value_converted_currency: 'CAD';
};

/** Stamp call order-value fields for USD original + FX → CAD reporting. */
export function buildUsdToCadCallOrderValue(input: {
  originalAmountUsd: unknown;
  exchangeRate: unknown;
  exchangeRateDate: unknown;
}): { ok: true; stamp: CallOrderValueConversionStamp } | { ok: false; error: string } {
  const built = buildUsdToCadOrderConversion({
    ...input,
    requireLabel: 'OGR call order values',
  });
  if (!built.ok) return built;
  return {
    ok: true,
    stamp: {
      order_value_original_amount: built.stamp.original_amount,
      order_value_original_currency: 'USD',
      order_value_cad: built.stamp.total_amount_cad,
      order_value_exchange_rate: built.stamp.exchange_rate,
      order_value_exchange_rate_date: built.stamp.exchange_rate_date,
      order_value_conversion_source: STAFF_USD_CAD_CONVERSION_SOURCE,
      order_value_converted_amount: built.stamp.converted_amount,
      order_value_converted_currency: 'CAD',
    },
  };
}

/** Explicit CAD call order-value: 1:1 into order_value_cad reporting. */
export function buildCadCallOrderValue(input: {
  amountCad: unknown;
  exchangeRateDate: unknown;
}): { ok: true; stamp: CallOrderValueConversionStamp } | { ok: false; error: string } {
  const amount =
    typeof input.amountCad === 'number' && Number.isFinite(input.amountCad)
      ? input.amountCad
      : typeof input.amountCad === 'string' && input.amountCad.trim()
        ? Number(input.amountCad)
        : NaN;
  const exchangeRateDate =
    typeof input.exchangeRateDate === 'string' ? input.exchangeRateDate.trim() : '';
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: 'Enter a valid order value (CAD).' };
  }
  if (!exchangeRateDate) {
    return { ok: false, error: 'Call order value requires a rate date.' };
  }
  const rounded = Math.round(amount * 100) / 100;
  return {
    ok: true,
    stamp: {
      order_value_original_amount: rounded,
      order_value_original_currency: 'CAD',
      order_value_cad: rounded,
      order_value_exchange_rate: 1,
      order_value_exchange_rate_date: exchangeRateDate,
      order_value_conversion_source: 'legacy_cad_column',
      order_value_converted_amount: rounded,
      order_value_converted_currency: 'CAD',
    },
  };
}

export const CALL_SELECT =
  'id, prospect_id, contact_name, outcome, pmf_score, order_value_cad, call_date, notes, objection_tags, line_id, retailer_line_account_id' as const;

export type CallRow = {
  id: string;
  prospect_id: number;
  contact_name: string | null;
  outcome: string;
  pmf_score: number | null;
  order_value_cad: number | null;
  call_date: string;
  notes: string | null;
  objection_tags: string[];
  line_id: string | null;
  retailer_line_account_id: string | null;
};

export type FetchCallsOptions = {
  limit?: number;
  /** When set, only calls for this sales line (Phase 2 scoped reads). */
  salesLineId?: string;
};

export async function fetchCalls(limitOrOptions: number | FetchCallsOptions = 500): Promise<{
  data: CallRow[];
  error: string | null;
}> {
  const options: FetchCallsOptions =
    typeof limitOrOptions === 'number' ? { limit: limitOrOptions } : limitOrOptions;
  const limit = options.limit ?? 500;

  let query = supabase
    .from('calls')
    .select(CALL_SELECT)
    .order('call_date', { ascending: false })
    .limit(limit);

  if (options.salesLineId) {
    query = query.eq('line_id', options.salesLineId);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as CallRow[], error: null };
}

export type ProspectFollowUpContext = {
  followUpDate: string;
  overdueDays: number;
};

function dateDiffDays(fromYmd: string, toYmd: string): number {
  const fromMs = Date.parse(`${fromYmd}T12:00:00.000Z`);
  const toMs = Date.parse(`${toYmd}T12:00:00.000Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return Math.max(0, Math.round((toMs - fromMs) / (24 * 60 * 60 * 1000)));
}

/**
 * Latest call per prospect: due only when that call has follow_up_date <= today (Vancouver).
 */
export async function fetchProspectFollowUpContext(
  client: Client,
  options?: { asOf?: Date; prospectIds?: number[] },
): Promise<Map<number, ProspectFollowUpContext>> {
  const today = formatOutreachPreparationDate(options?.asOf ?? new Date(), AGENT_OUTREACH_PREP_TZ);
  let query = client
    .from('calls')
    .select('prospect_id, follow_up_date, call_date, created_at')
    .order('call_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (options?.prospectIds && options.prospectIds.length > 0) {
    query = query.in('prospect_id', options.prospectIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const latestByProspect = new Map<number, string | null>();
  for (const row of data ?? []) {
    if (typeof row.prospect_id !== 'number' || !Number.isFinite(row.prospect_id)) continue;
    if (!latestByProspect.has(row.prospect_id)) {
      latestByProspect.set(row.prospect_id, row.follow_up_date ?? null);
    }
  }

  const result = new Map<number, ProspectFollowUpContext>();
  for (const [prospectId, followUpDate] of latestByProspect) {
    if (!followUpDate || followUpDate > today) continue;
    result.set(prospectId, {
      followUpDate,
      overdueDays: dateDiffDays(followUpDate, today),
    });
  }
  return result;
}

/** Prospects logged today (Vancouver call_date) with latest call created_at per prospect. */
export async function loadProspectsCalledToday(
  client: Client,
  options?: { asOf?: Date; prospectIds?: number[] },
): Promise<Map<number, string>> {
  const today = formatOutreachPreparationDate(options?.asOf ?? new Date(), AGENT_OUTREACH_PREP_TZ);
  let query = client.from('calls').select('prospect_id, created_at').eq('call_date', today);

  if (options?.prospectIds && options.prospectIds.length > 0) {
    query = query.in('prospect_id', options.prospectIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const result = new Map<number, string>();
  for (const row of data ?? []) {
    if (typeof row.prospect_id !== 'number' || !row.created_at) continue;
    const prev = result.get(row.prospect_id);
    if (!prev || row.created_at > prev) {
      result.set(row.prospect_id, row.created_at);
    }
  }
  return result;
}

/**
 * Thin Phase 3 helper: prospects with latest-call follow_up_date <= today (Vancouver).
 */
export async function fetchDueCallFollowUps(
  client: Client,
  options?: { asOf?: Date; prospectIds?: number[] },
): Promise<Set<number>> {
  const ctx = await fetchProspectFollowUpContext(client, options);
  return new Set(ctx.keys());
}
