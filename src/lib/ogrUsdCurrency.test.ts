/**
 * OGR operational currency: USD default + FX→CAD reporting proofs.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCadCallOrderValue, buildUsdToCadCallOrderValue } from '@/lib/calls';
import { insertOrder } from '@/lib/orders';

const root = process.cwd();
const migrationPath = resolve(
  root,
  'supabase/migrations/20260820120000_ogr_default_currency_usd.sql',
);

const insertMock = vi.fn();
const singleMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: (row: unknown) => {
        insertMock(row);
        return {
          select: () => ({
            single: () => singleMock(),
          }),
        };
      },
    }),
  },
}));

describe('OGR USD default migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('sets OGR default_currency and ai_profile.currency to USD without rewriting orders', () => {
    expect(sql).toMatch(/default_currency = 'USD'/);
    expect(sql).toMatch(/jsonb_set\([\s\S]*'\{currency\}'[\s\S]*'"USD"'/);
    expect(sql).toMatch(/where code = 'ogr'/);
    expect(sql).not.toMatch(/update\s+orders\b/i);
    expect(sql).not.toMatch(/update\s+calls\b/i);
  });

  it('rejects incomplete USD and never invents rate 1 for USD', () => {
    expect(sql).toMatch(/Incomplete USD order conversion/);
    expect(sql).toMatch(/Incomplete USD call order-value conversion/);
    expect(sql).toMatch(/raise exception/);
    // CAD legacy fill may still use rate 1; USD branch must not assign exchange_rate := 1
    const usdBlock = sql.slice(
      sql.indexOf("upper(v_currency) = 'USD'"),
      sql.indexOf('if v_currency is null'),
    );
    expect(usdBlock).not.toMatch(/exchange_rate\s*:=\s*1/);
  });
});

describe('OGR insertOrder currency proofs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    singleMock.mockResolvedValue({ data: { id: 'ord-1' }, error: null });
  });

  it('unspecified OGR → USD with FX; total_amount_cad is converted not raw USD', async () => {
    const result = await insertOrder(
      {
        account_id: 1,
        order_type: 'reorder',
        season: 'spring_summer',
        order_date: '2026-08-20',
        total_amount_cad: 200,
        original_amount: 200,
        exchange_rate: 1.37,
        exchange_rate_date: '2026-08-20',
        line_id: 'line-ogr',
        retailer_line_account_id: 'rla-ogr',
      },
      { writesEnabled: true, lineCode: 'ogr', lineDefaultCurrency: 'USD' },
    );
    expect(result.error).toBeNull();
    const payload = insertMock.mock.calls[0]?.[0] as {
      original_currency?: string;
      original_amount?: number;
      total_amount_cad?: number;
      conversion_source?: string;
    };
    expect(payload.original_currency).toBe('USD');
    expect(payload.original_amount).toBe(200);
    expect(payload.total_amount_cad).toBe(274);
    expect(payload.total_amount_cad).not.toBe(payload.original_amount);
    expect(payload.conversion_source).toBe('staff_usd_cad');
  });

  it('explicit CAD works and is preserved', async () => {
    const result = await insertOrder(
      {
        account_id: 1,
        order_type: 'reorder',
        season: 'spring_summer',
        order_date: '2026-08-20',
        total_amount_cad: 450,
        original_currency: 'CAD',
        line_id: 'line-ogr',
        retailer_line_account_id: 'rla-ogr',
      },
      { writesEnabled: true, lineCode: 'ogr', lineDefaultCurrency: 'USD' },
    );
    expect(result.error).toBeNull();
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        original_currency: 'CAD',
        total_amount_cad: 450,
        conversion_source: 'legacy_cad_column',
        exchange_rate: 1,
      }),
    );
  });

  it('incomplete USD fails clearly without inserting', async () => {
    const missingRate = await insertOrder(
      {
        account_id: 1,
        order_type: 'initial',
        season: 'fathers_day',
        order_date: '2026-08-20',
        original_amount: 100,
        original_currency: 'USD',
        line_id: 'line-ogr',
        retailer_line_account_id: 'rla-ogr',
      },
      { writesEnabled: true, lineCode: 'ogr', lineDefaultCurrency: 'USD' },
    );
    expect(missingRate.error).toMatch(/exchange_rate/);
    expect(insertMock).not.toHaveBeenCalled();

    const unspecifiedNoFx = await insertOrder(
      {
        account_id: 1,
        order_type: 'initial',
        season: 'fathers_day',
        order_date: '2026-08-20',
        total_amount_cad: 100,
        line_id: 'line-ogr',
        retailer_line_account_id: 'rla-ogr',
      },
      { writesEnabled: true, lineCode: 'ogr', lineDefaultCurrency: 'USD' },
    );
    expect(unspecifiedNoFx.error).toMatch(/OGR orders require/);
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe('OGR call order-value conversion proofs', () => {
  it('USD stamp converts into order_value_cad; raw USD never equals reporting when rate ≠ 1', () => {
    const built = buildUsdToCadCallOrderValue({
      originalAmountUsd: 100,
      exchangeRate: 1.4,
      exchangeRateDate: '2026-08-20',
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.stamp.order_value_original_currency).toBe('USD');
    expect(built.stamp.order_value_original_amount).toBe(100);
    expect(built.stamp.order_value_cad).toBe(140);
    expect(built.stamp.order_value_cad).not.toBe(built.stamp.order_value_original_amount);
    expect(built.stamp.order_value_conversion_source).toBe('staff_usd_cad');
  });

  it('incomplete USD call value fails; explicit CAD preserves amount in order_value_cad', () => {
    const incomplete = buildUsdToCadCallOrderValue({
      originalAmountUsd: 50,
      exchangeRate: undefined,
      exchangeRateDate: '2026-08-20',
    });
    expect(incomplete.ok).toBe(false);

    const cad = buildCadCallOrderValue({
      amountCad: 75,
      exchangeRateDate: '2026-08-20',
    });
    expect(cad.ok).toBe(true);
    if (!cad.ok) return;
    expect(cad.stamp.order_value_original_currency).toBe('CAD');
    expect(cad.stamp.order_value_cad).toBe(75);
    expect(cad.stamp.order_value_exchange_rate).toBe(1);
  });
});
