import { supabase } from '@/lib/supabase';
import { resolveOgrLineId } from '@/lib/lines';
import { assertProspectiveOperationalWriteForbidden } from '@/lib/prospectiveLines';
import type { ApparelSeason, Order, OrderInsert, OrderStatus, OrderType } from '@/types/database';

export const ORDER_SELECT =
  'id, account_id, line_id, order_type, season, order_date, total_amount_cad, status, notes, created_at, updated_at' as const;

export type OrderRow = Order;

export type FetchOrdersOptions = {
  /** When set, restrict to orders for this sales line (read-only Phase 2 filter). */
  salesLineId?: string;
};

export async function fetchOrdersForAccount(
  accountId: number,
  options: FetchOrdersOptions = {},
): Promise<{ data: OrderRow[]; error: string | null }> {
  let query = supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('account_id', accountId)
    .order('order_date', { ascending: false });

  if (options.salesLineId) {
    query = query.eq('line_id', options.salesLineId);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as OrderRow[], error: null };
}

/** Batch-fetch orders for many accounts. Empty id list returns [] without querying. */
export async function fetchOrdersForAccounts(
  accountIds: number[],
  options: FetchOrdersOptions = {},
): Promise<{ data: OrderRow[]; error: string | null }> {
  if (accountIds.length === 0) {
    return { data: [], error: null };
  }

  let query = supabase
    .from('orders')
    .select(ORDER_SELECT)
    .in('account_id', accountIds)
    .order('order_date', { ascending: false });

  if (options.salesLineId) {
    query = query.eq('line_id', options.salesLineId);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as OrderRow[], error: null };
}

export type InsertOrderOptions = {
  writesEnabled?: boolean;
  lineCode?: string | null;
  lineStatus?: string | null;
  lineDefaultCurrency?: string | null;
  eaglePeakSellingEnabled?: boolean;
  bigFishSellingEnabled?: boolean;
};

/** Staff-confirmed USD→CAD booking stamp. Never copy CAD into original_amount. */
export const STAFF_USD_CAD_CONVERSION_SOURCE = 'staff_usd_cad';
/** @deprecated Prefer STAFF_USD_CAD_CONVERSION_SOURCE — alias kept for Eagle Peak tests. */
export const EAGLE_PEAK_ORDER_CONVERSION_SOURCE = STAFF_USD_CAD_CONVERSION_SOURCE;

export type UsdToCadOrderConversionStamp = {
  original_amount: number;
  original_currency: 'USD';
  total_amount_cad: number;
  exchange_rate: number;
  exchange_rate_date: string;
  conversion_source: string;
  converted_amount: number;
  converted_currency: 'CAD';
};

export type EaglePeakOrderConversionStamp = UsdToCadOrderConversionStamp;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Build a complete USD→CAD conversion record.
 * Requires USD original + FX rate + rate date. Does not treat USD as CAD 1:1.
 */
export function buildUsdToCadOrderConversion(input: {
  originalAmountUsd: unknown;
  exchangeRate: unknown;
  exchangeRateDate: unknown;
  requireLabel?: string;
}): { ok: true; stamp: UsdToCadOrderConversionStamp } | { ok: false; error: string } {
  const label = input.requireLabel ?? 'USD orders';
  const requireMsg = `${label} require original_amount in USD, exchange_rate, and exchange_rate_date`;
  const originalAmountUsd = asFiniteNumber(input.originalAmountUsd);
  const exchangeRate = asFiniteNumber(input.exchangeRate);
  const exchangeRateDate =
    typeof input.exchangeRateDate === 'string' ? input.exchangeRateDate.trim() : '';

  if (originalAmountUsd == null || originalAmountUsd < 0) {
    return { ok: false, error: requireMsg };
  }
  if (exchangeRate == null || exchangeRate <= 0) {
    return { ok: false, error: requireMsg };
  }
  if (!exchangeRateDate) {
    return { ok: false, error: requireMsg };
  }

  const totalAmountCad = roundMoney(originalAmountUsd * exchangeRate);
  return {
    ok: true,
    stamp: {
      original_amount: roundMoney(originalAmountUsd),
      original_currency: 'USD',
      total_amount_cad: totalAmountCad,
      exchange_rate: exchangeRate,
      exchange_rate_date: exchangeRateDate,
      conversion_source: STAFF_USD_CAD_CONVERSION_SOURCE,
      converted_amount: totalAmountCad,
      converted_currency: 'CAD',
    },
  };
}

/** Eagle Peak alias — preserves EP-specific error wording for existing tests. */
export function buildEaglePeakOrderConversion(input: {
  originalAmountUsd: unknown;
  exchangeRate: unknown;
  exchangeRateDate: unknown;
}): { ok: true; stamp: EaglePeakOrderConversionStamp } | { ok: false; error: string } {
  return buildUsdToCadOrderConversion({
    ...input,
    requireLabel: 'Eagle Peak orders',
  });
}

function applyUsdStamp(payload: OrderInsert, stamp: UsdToCadOrderConversionStamp): void {
  payload.original_amount = stamp.original_amount;
  payload.original_currency = stamp.original_currency;
  payload.total_amount_cad = stamp.total_amount_cad;
  payload.exchange_rate = stamp.exchange_rate;
  payload.exchange_rate_date = stamp.exchange_rate_date;
  payload.conversion_source = stamp.conversion_source;
  payload.converted_amount = stamp.converted_amount;
  payload.converted_currency = stamp.converted_currency;
}

function applyCadLegacyStamp(payload: OrderInsert): void {
  payload.original_amount = payload.original_amount ?? payload.total_amount_cad;
  payload.original_currency = 'CAD';
  payload.conversion_source = payload.conversion_source ?? 'legacy_cad_column';
  payload.exchange_rate = payload.exchange_rate ?? 1;
  payload.exchange_rate_date = payload.exchange_rate_date ?? payload.order_date;
  payload.converted_amount = payload.converted_amount ?? payload.total_amount_cad;
  payload.converted_currency = payload.converted_currency ?? 'CAD';
}

export async function insertOrder(
  input: OrderInsert,
  options: InsertOrderOptions = {},
): Promise<{ data: OrderRow | null; error: string | null }> {
  const prospectiveError = assertProspectiveOperationalWriteForbidden(options.lineStatus);
  if (prospectiveError) {
    return { data: null, error: prospectiveError };
  }
  const payload: OrderInsert = { ...input };
  if (!options.writesEnabled && !payload.line_id && !payload.retailer_line_account_id) {
    const ogrId = await resolveOgrLineId();
    if (ogrId) {
      payload.line_id = ogrId;
      const { data: rla, error: rlaError } = await supabase
        .from('retailer_line_accounts')
        .select('id')
        .eq('retailer_id', payload.account_id)
        .eq('sales_line_id', ogrId)
        .neq('relationship_status', 'terminated')
        .maybeSingle();
      if (rlaError) {
        return { data: null, error: rlaError.message };
      }
      if (rla) payload.retailer_line_account_id = rla.id;
    }
  }
  if (options.writesEnabled) {
    if (!payload.line_id || !payload.retailer_line_account_id) {
      return {
        data: null,
        error: 'line_id and retailer_line_account_id are required',
      };
    }
    if (options.lineCode === 'eagle-peak' && !options.eaglePeakSellingEnabled) {
      return { data: null, error: 'Eagle Peak selling is not enabled' };
    }
    if (options.lineCode === 'big-fish' && !options.bigFishSellingEnabled) {
      return { data: null, error: 'Big Fish selling is not enabled' };
    }
    const lineDefaultCurrency =
      typeof options.lineDefaultCurrency === 'string' ? options.lineDefaultCurrency.trim() : '';
    if (options.lineCode === 'big-fish' && !lineDefaultCurrency) {
      return { data: null, error: 'Big Fish orders require default_currency to be configured' };
    }
    if (
      options.lineCode === 'big-fish' &&
      lineDefaultCurrency &&
      lineDefaultCurrency !== 'USD' &&
      lineDefaultCurrency !== 'CAD'
    ) {
      return {
        data: null,
        error: 'Big Fish orders require default_currency of USD or CAD',
      };
    }

    if (!payload.original_currency) {
      if (options.lineCode === 'eagle-peak') {
        payload.original_currency = 'USD';
      } else if (options.lineCode === 'ogr') {
        payload.original_currency = lineDefaultCurrency || 'USD';
      } else if (options.lineCode === 'big-fish') {
        payload.original_currency = lineDefaultCurrency;
      } else {
        payload.original_currency = lineDefaultCurrency || 'CAD';
      }
    }

    const resolvedCurrency =
      typeof payload.original_currency === 'string' ? payload.original_currency.trim() : '';

    if (options.lineCode === 'eagle-peak' && resolvedCurrency !== 'USD') {
      return { data: null, error: 'Eagle Peak orders require original_currency = USD' };
    }
    if (
      options.lineCode === 'big-fish' &&
      lineDefaultCurrency === 'USD' &&
      resolvedCurrency !== 'USD'
    ) {
      return { data: null, error: 'Big Fish USD orders require original_currency = USD' };
    }

    if (resolvedCurrency === 'USD') {
      const requireLabel =
        options.lineCode === 'eagle-peak'
          ? 'Eagle Peak orders'
          : options.lineCode === 'big-fish'
            ? 'Big Fish USD orders'
            : options.lineCode === 'ogr'
              ? 'OGR orders'
              : 'USD orders';
      const built = buildUsdToCadOrderConversion({
        originalAmountUsd: payload.original_amount,
        exchangeRate: payload.exchange_rate,
        exchangeRateDate: payload.exchange_rate_date ?? payload.order_date,
        requireLabel,
      });
      if (!built.ok) {
        return { data: null, error: built.error };
      }
      applyUsdStamp(payload, built.stamp);
    } else if (resolvedCurrency === 'CAD') {
      applyCadLegacyStamp(payload);
    }
  }

  const { data, error } = await supabase
    .from('orders')
    .insert(payload)
    .select(ORDER_SELECT)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as OrderRow, error: null };
}

export type { ApparelSeason, OrderStatus, OrderType };
