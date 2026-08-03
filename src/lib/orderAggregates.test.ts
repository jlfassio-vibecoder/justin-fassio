import { describe, expect, it } from 'vitest';
import {
  filterOrdersBySeason,
  groupOrdersByAccountId,
  lastOrderDate,
  latestSeason,
  totalLifetimeValueCad,
} from '@/lib/orderAggregates';
import type { OrderRow } from '@/lib/orders';

function order(
  partial: Partial<OrderRow> & Pick<OrderRow, 'id' | 'account_id' | 'order_date'>,
): OrderRow {
  return {
    line_id: null,
    order_type: 'reorder',
    season: 'spring_summer',
    total_amount_cad: 0,
    status: 'submitted',
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('orderAggregates', () => {
  it('sums lifetime value', () => {
    expect(
      totalLifetimeValueCad([
        order({ id: '1', account_id: 1, order_date: '2026-01-01', total_amount_cad: 100 }),
        order({ id: '2', account_id: 1, order_date: '2026-02-01', total_amount_cad: 250.5 }),
      ]),
    ).toBe(350.5);
    expect(totalLifetimeValueCad([])).toBe(0);
  });

  it('picks the latest order date', () => {
    expect(
      lastOrderDate([
        order({ id: '1', account_id: 1, order_date: '2026-01-15' }),
        order({ id: '2', account_id: 1, order_date: '2026-03-01' }),
        order({ id: '3', account_id: 1, order_date: '2026-02-10' }),
      ]),
    ).toBe('2026-03-01');
    expect(lastOrderDate([])).toBeNull();
  });

  it('returns season of the most recent order', () => {
    expect(
      latestSeason([
        order({
          id: '1',
          account_id: 1,
          order_date: '2026-01-15',
          season: 'fathers_day',
        }),
        order({
          id: '2',
          account_id: 1,
          order_date: '2026-08-01',
          season: 'holiday_christmas',
        }),
      ]),
    ).toBe('holiday_christmas');
    expect(latestSeason([])).toBeNull();
  });

  it('groups orders by account id', () => {
    const grouped = groupOrdersByAccountId([
      order({ id: '1', account_id: 10, order_date: '2026-01-01' }),
      order({ id: '2', account_id: 20, order_date: '2026-01-02' }),
      order({ id: '3', account_id: 10, order_date: '2026-01-03' }),
    ]);
    expect(grouped.get(10)).toHaveLength(2);
    expect(grouped.get(20)).toHaveLength(1);
  });

  it('filters orders by season', () => {
    const rows = [
      order({ id: '1', account_id: 1, order_date: '2026-01-01', season: 'fathers_day' }),
      order({ id: '2', account_id: 1, order_date: '2026-02-01', season: 'holiday_christmas' }),
      order({ id: '3', account_id: 1, order_date: '2026-03-01', season: 'fathers_day' }),
    ];
    expect(filterOrdersBySeason(rows, 'ALL')).toHaveLength(3);
    expect(filterOrdersBySeason(rows, 'fathers_day').map((o) => o.id)).toEqual(['1', '3']);
    expect(filterOrdersBySeason(rows, 'ats_in_season')).toEqual([]);
  });
});
