import type { ApparelSeason } from '@/types/database';
import type { OrderRow } from '@/lib/orders';

export function totalLifetimeValueCad(orders: Pick<OrderRow, 'total_amount_cad'>[]): number {
  return orders.reduce((sum, o) => sum + Number(o.total_amount_cad ?? 0), 0);
}

/** Most recent order_date (YYYY-MM-DD), or null if none. */
export function lastOrderDate(orders: Pick<OrderRow, 'order_date'>[]): string | null {
  if (orders.length === 0) return null;
  let latest = orders[0]!.order_date;
  for (let i = 1; i < orders.length; i++) {
    const d = orders[i]!.order_date;
    if (d > latest) latest = d;
  }
  return latest;
}

/** Season of the most recent order by order_date, or null. */
export function latestSeason(
  orders: Pick<OrderRow, 'order_date' | 'season'>[],
): ApparelSeason | null {
  if (orders.length === 0) return null;
  let best = orders[0]!;
  for (let i = 1; i < orders.length; i++) {
    const o = orders[i]!;
    if (o.order_date > best.order_date) best = o;
  }
  return best.season;
}

export function groupOrdersByAccountId(orders: OrderRow[]): Map<number, OrderRow[]> {
  const map = new Map<number, OrderRow[]>();
  for (const order of orders) {
    const list = map.get(order.account_id);
    if (list) list.push(order);
    else map.set(order.account_id, [order]);
  }
  return map;
}

export type SeasonFilter = ApparelSeason | 'ALL';

/** Filter by apparel season. `'ALL'` returns a shallow copy (order preserved). */
export function filterOrdersBySeason<T extends Pick<OrderRow, 'season'>>(
  orders: T[],
  season: SeasonFilter,
): T[] {
  if (season === 'ALL') return [...orders];
  return orders.filter((o) => o.season === season);
}
