import { supabase } from '@/lib/supabase';
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
  lineDefaultCurrency?: string | null;
};

export async function insertOrder(
  input: OrderInsert,
  options: InsertOrderOptions = {},
): Promise<{ data: OrderRow | null; error: string | null }> {
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
