import { supabase } from '@/lib/supabase';
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
export const EAGLE_PEAK_ORDER_CONVERSION_SOURCE = 'staff_usd_cad';

export type EaglePeakOrderConversionStamp = {
  original_amount: number;
  original_currency: 'USD';
  total_amount_cad: number;
  exchange_rate: number;
  exchange_rate_date: string;
  conversion_source: string;
  converted_amount: number;
  converted_currency: 'CAD';
};

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
 * Build a complete Eagle Peak conversion record.
 * Requires USD original + FX rate + rate date. Does not treat USD as CAD 1:1.
 */
export function buildEaglePeakOrderConversion(input: {
  originalAmountUsd: unknown;
  exchangeRate: unknown;
  exchangeRateDate: unknown;
}): { ok: true; stamp: EaglePeakOrderConversionStamp } | { ok: false; error: string } {
  const originalAmountUsd = asFiniteNumber(input.originalAmountUsd);
  const exchangeRate = asFiniteNumber(input.exchangeRate);
  const exchangeRateDate =
    typeof input.exchangeRateDate === 'string' ? input.exchangeRateDate.trim() : '';

  if (originalAmountUsd == null || originalAmountUsd < 0) {
    return {
      ok: false,
      error:
        'Eagle Peak orders require original_amount in USD, exchange_rate, and exchange_rate_date',
    };
  }
  if (exchangeRate == null || exchangeRate <= 0) {
    return {
      ok: false,
      error:
        'Eagle Peak orders require original_amount in USD, exchange_rate, and exchange_rate_date',
    };
  }
  if (!exchangeRateDate) {
    return {
      ok: false,
      error:
        'Eagle Peak orders require original_amount in USD, exchange_rate, and exchange_rate_date',
    };
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
      conversion_source: EAGLE_PEAK_ORDER_CONVERSION_SOURCE,
      converted_amount: totalAmountCad,
      converted_currency: 'CAD',
    },
  };
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
  if (options.writesEnabled) {
    if (!payload.line_id || !payload.retailer_line_account_id) {
      return {
        data: null,
        error: 'line_id and retailer_line_account_id are required',
      };
    }
    if (options.lineCode === 'ogr' && payload.original_currency === 'USD') {
      return { data: null, error: 'OGR orders cannot use USD as original_currency' };
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
    if (options.lineCode === 'eagle-peak') {
      const providedCurrency =
        typeof payload.original_currency === 'string' ? payload.original_currency.trim() : '';
      if (providedCurrency && providedCurrency !== 'USD') {
        return { data: null, error: 'Eagle Peak orders require original_currency = USD' };
      }
      const built = buildEaglePeakOrderConversion({
        originalAmountUsd: payload.original_amount,
        exchangeRate: payload.exchange_rate,
        exchangeRateDate: payload.exchange_rate_date ?? payload.order_date,
      });
      if (!built.ok) {
        return { data: null, error: built.error };
      }
      payload.original_amount = built.stamp.original_amount;
      payload.original_currency = built.stamp.original_currency;
      payload.total_amount_cad = built.stamp.total_amount_cad;
      payload.exchange_rate = built.stamp.exchange_rate;
      payload.exchange_rate_date = built.stamp.exchange_rate_date;
      payload.conversion_source = built.stamp.conversion_source;
      payload.converted_amount = built.stamp.converted_amount;
      payload.converted_currency = built.stamp.converted_currency;
    }
    if (options.lineCode === 'big-fish' && lineDefaultCurrency === 'USD') {
      const providedCurrency =
        typeof payload.original_currency === 'string' ? payload.original_currency.trim() : '';
      if (providedCurrency && providedCurrency !== 'USD') {
        return { data: null, error: 'Big Fish USD orders require original_currency = USD' };
      }
      const built = buildEaglePeakOrderConversion({
        originalAmountUsd: payload.original_amount,
        exchangeRate: payload.exchange_rate,
        exchangeRateDate: payload.exchange_rate_date ?? payload.order_date,
      });
      if (!built.ok) {
        return { data: null, error: built.error };
      }
      payload.original_amount = built.stamp.original_amount;
      payload.original_currency = built.stamp.original_currency;
      payload.total_amount_cad = built.stamp.total_amount_cad;
      payload.exchange_rate = built.stamp.exchange_rate;
      payload.exchange_rate_date = built.stamp.exchange_rate_date;
      payload.conversion_source = built.stamp.conversion_source;
      payload.converted_amount = built.stamp.converted_amount;
      payload.converted_currency = built.stamp.converted_currency;
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
      const originalCurrency =
        options.lineCode === 'ogr' ? 'CAD' : (options.lineDefaultCurrency ?? 'CAD');
      payload.original_currency = originalCurrency;
      payload.original_amount = payload.original_amount ?? payload.total_amount_cad;
      if (originalCurrency === 'CAD') {
        payload.conversion_source = payload.conversion_source ?? 'legacy_cad_column';
        payload.exchange_rate = payload.exchange_rate ?? 1;
        payload.exchange_rate_date = payload.exchange_rate_date ?? payload.order_date;
        payload.converted_amount = payload.converted_amount ?? payload.total_amount_cad;
        payload.converted_currency = payload.converted_currency ?? 'CAD';
      }
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
