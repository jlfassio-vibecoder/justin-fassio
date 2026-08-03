import { supabase } from '@/lib/supabase';
import type { ApparelSeason, Order, OrderInsert, OrderStatus, OrderType } from '@/types/database';

export const ORDER_SELECT =
  'id, account_id, line_id, order_type, season, order_date, total_amount_cad, status, notes, created_at, updated_at' as const;

export type OrderRow = Order;

export async function fetchOrdersForAccount(
  accountId: number,
): Promise<{ data: OrderRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('account_id', accountId)
    .order('order_date', { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as OrderRow[], error: null };
}

/** Batch-fetch orders for many accounts. Empty id list returns [] without querying. */
export async function fetchOrdersForAccounts(
  accountIds: number[],
): Promise<{ data: OrderRow[]; error: string | null }> {
  if (accountIds.length === 0) {
    return { data: [], error: null };
  }

  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .in('account_id', accountIds)
    .order('order_date', { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as OrderRow[], error: null };
}

export async function insertOrder(
  input: OrderInsert,
): Promise<{ data: OrderRow | null; error: string | null }> {
  const { data, error } = await supabase.from('orders').insert(input).select(ORDER_SELECT).single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as OrderRow, error: null };
}

export type { ApparelSeason, OrderStatus, OrderType };
