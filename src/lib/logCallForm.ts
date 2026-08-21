import { accountContactRoleLabel, type AccountContact } from '@/lib/accountContacts';
import { buildCadCallOrderValue, buildUsdToCadCallOrderValue } from '@/lib/calls';
import type { PrimaryRetailChannel } from '@/lib/crmRetailTaxonomy';
import { isPrimaryRetailChannel } from '@/lib/crmRetailTaxonomy';
import { resolveOgrLineId } from '@/lib/lines';
import { ensureRetailerLineAccount } from '@/lib/retailerLineAccounts';
import { formatLocalIsoDate } from '@/lib/reorderCadence';
import { supabase } from '@/lib/supabase';
import type { CallInsert } from '@/types/database';

export const LOG_CALL_HISTORY_SELECT =
  'id, call_date, contact_name, outcome, objection_tags, follow_up_date, notes, created_at' as const;

export type PreviousCallForLog = {
  id: string;
  callDate: string;
  contactName: string | null;
  outcome: string;
  objectionTags: string[];
  followUpDate: string | null;
  notes: string | null;
  createdAt: string;
};

type CallHistoryRow = {
  id: string;
  call_date: string;
  contact_name: string | null;
  outcome: string;
  objection_tags: string[] | null;
  follow_up_date: string | null;
  notes: string | null;
  created_at: string;
};

export function mapPreviousCallRow(row: CallHistoryRow): PreviousCallForLog {
  return {
    id: row.id,
    callDate: row.call_date,
    contactName: row.contact_name,
    outcome: row.outcome,
    objectionTags: row.objection_tags ?? [],
    followUpDate: row.follow_up_date,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

/** Format contact for `calls.contact_name` (title preferred, else role). */
export function formatCallContactName(contact: AccountContact): string {
  const label = contact.title?.trim() || accountContactRoleLabel(contact.role);
  return label ? `${contact.fullName} (${label})` : contact.fullName;
}

/**
 * Previous calls for the same retailer + sales line, newest first.
 * When `salesLineId` is null, scopes by prospect only (legacy unscoped rows).
 */
export async function fetchPreviousCallsForLog(input: {
  prospectId: number;
  salesLineId: string | null;
  limit?: number;
}): Promise<{ data: PreviousCallForLog[]; error: string | null }> {
  const limit = input.limit ?? 25;
  let query = supabase
    .from('calls')
    .select(LOG_CALL_HISTORY_SELECT)
    .eq('prospect_id', input.prospectId);

  if (input.salesLineId) {
    query = query.eq('line_id', input.salesLineId);
  }

  const { data, error } = await query
    .order('call_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    return { data: [], error: error.message };
  }

  return {
    data: ((data ?? []) as CallHistoryRow[]).map(mapPreviousCallRow),
    error: null,
  };
}

export type BuildLogCallInsertInput = {
  prospectId: number;
  contactName: string;
  outcome: string;
  pmfScore: number | null;
  objectionTags: string[];
  notes: string | null;
  callDate: string;
  followUpDate: string | null;
  orderValue: string;
  isOgrCall: boolean;
  ogrCurrency: 'USD' | 'CAD';
  exchangeRate: string;
  exchangeRateDate: string;
  salesLineId: string | null;
  eaglePeakSellingEnabled?: boolean;
  bigFishSellingEnabled?: boolean;
};

export type BuildLogCallInsertResult =
  | {
      ok: true;
      row: CallInsert;
      convertPrefillCad: number | null;
      convertPrefillUsd: number | null;
      convertPrefillExchangeRate: number | null;
      convertPrefillExchangeRateDate: string | null;
    }
  | { ok: false; error: string };

/** Build a `calls` insert row with OGR FX stamps and optional RLA linkage. */
export async function buildLogCallInsert(
  input: BuildLogCallInsertInput,
): Promise<BuildLogCallInsertResult> {
  const callDate = input.callDate.trim() || formatLocalIsoDate(new Date());
  const row: CallInsert = {
    prospect_id: input.prospectId,
    contact_name: input.contactName.trim(),
    outcome: input.outcome,
    pmf_score: input.pmfScore,
    order_value_cad: 0,
    call_date: callDate,
    objection_tags: input.objectionTags,
    notes: input.notes,
    follow_up_date: input.followUpDate,
  };

  let convertPrefillCad: number | null = null;
  let convertPrefillUsd: number | null = null;
  let convertPrefillExchangeRate: number | null = null;
  let convertPrefillExchangeRateDate: string | null = null;

  if (input.orderValue !== '' && Number(input.orderValue) > 0) {
    const usesUsdFx = input.isOgrCall && input.ogrCurrency === 'USD';
    if (input.isOgrCall && usesUsdFx) {
      const stamped = buildUsdToCadCallOrderValue({
        originalAmountUsd: input.orderValue,
        exchangeRate: input.exchangeRate,
        exchangeRateDate: input.exchangeRateDate.trim() || callDate,
      });
      if (!stamped.ok) return stamped;
      Object.assign(row, stamped.stamp);
      convertPrefillCad = stamped.stamp.order_value_cad;
      convertPrefillUsd = stamped.stamp.order_value_original_amount;
      convertPrefillExchangeRate = stamped.stamp.order_value_exchange_rate;
      convertPrefillExchangeRateDate = stamped.stamp.order_value_exchange_rate_date;
    } else if (input.isOgrCall && input.ogrCurrency === 'CAD') {
      const stamped = buildCadCallOrderValue({
        amountCad: input.orderValue,
        exchangeRateDate: input.exchangeRateDate.trim() || callDate,
      });
      if (!stamped.ok) return stamped;
      Object.assign(row, stamped.stamp);
      convertPrefillCad = stamped.stamp.order_value_cad;
    } else {
      const amount = Number(input.orderValue);
      if (Number.isNaN(amount) || amount < 0) {
        return { ok: false, error: 'Enter a valid order value (CAD).' };
      }
      row.order_value_cad = amount;
      convertPrefillCad = amount;
    }
  }

  const salesLineId = input.salesLineId || (await resolveOgrLineId());
  if (salesLineId) {
    const ensured = await ensureRetailerLineAccount({
      retailerId: input.prospectId,
      salesLineId,
      eaglePeakSellingEnabled: input.eaglePeakSellingEnabled,
      bigFishSellingEnabled: input.bigFishSellingEnabled,
    });
    if (ensured.gate === 'reject' || ensured.error || !ensured.data) {
      return {
        ok: false,
        error: ensured.error ?? 'Operational writes are not allowed for this line',
      };
    }
    row.line_id = salesLineId;
    row.retailer_line_account_id = ensured.data.id;
  }

  return {
    ok: true,
    row,
    convertPrefillCad,
    convertPrefillUsd,
    convertPrefillExchangeRate,
    convertPrefillExchangeRateDate,
  };
}

/** Persist primary retail channel on the retailer row. */
export async function updateProspectRetailChannel(
  prospectId: number,
  category: string,
): Promise<{ error: string | null }> {
  if (!isPrimaryRetailChannel(category)) {
    return { error: 'Select a valid retail channel.' };
  }
  const { error } = await supabase
    .from('prospects')
    .update({ category: category as PrimaryRetailChannel })
    .eq('id', prospectId);
  return { error: error?.message ?? null };
}
