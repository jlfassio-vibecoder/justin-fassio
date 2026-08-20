import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import {
  resolvePricingMarketForBuyerProspect,
  resolvePricingMarketForProspectSalesLine,
  resolvePricingMarketForRetailerLineAccount,
} from '@/lib/resolveAccountPricingMarket';

type QueryResult = { data: unknown; error: { message: string } | null };

function mockClient(handlers: Record<string, QueryResult>): SupabaseClient<Database> {
  const from = vi.fn((table: string) => {
    const result = handlers[table] ?? { data: null, error: null };
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.eq = self;
    chain.neq = self;
    chain.maybeSingle = () => Promise.resolve(result);
    return chain;
  });
  return { from } as unknown as SupabaseClient<Database>;
}

const OR_SLT = {
  id: 'slt-or',
  sales_line_id: 'line-ogr',
  territory_id: 'geo-or',
  status: 'active',
};

const OR_GEO = { id: 'geo-or', code: 'or', country_code: 'US' };
const BC_GEO = { id: 'geo-bc', code: 'bc', country_code: 'CA' };

describe('resolvePricingMarketForRetailerLineAccount', () => {
  it('uses U.S. presentation for an active Oregon assignment', async () => {
    const client = mockClient({
      retailer_line_accounts: {
        data: {
          id: 'rla-1',
          sales_line_id: 'line-ogr',
          sales_line_territory_id: 'slt-or',
          relationship_status: 'active',
        },
        error: null,
      },
      sales_line_territories: { data: OR_SLT, error: null },
      territories: { data: OR_GEO, error: null },
    });
    const market = await resolvePricingMarketForRetailerLineAccount(client, 'rla-1');
    expect(market.publicMarket).toBe('us');
    expect(market.showCanadianRetail).toBe(false);
    expect(market.territoryCode).toBe('or');
    expect(market.source).toBe('rla_territory_assignment');
  });

  it('keeps Canadian presentation for an active BC assignment', async () => {
    const client = mockClient({
      retailer_line_accounts: {
        data: {
          id: 'rla-bc',
          sales_line_id: 'line-ogr',
          sales_line_territory_id: 'slt-bc',
          relationship_status: 'active',
        },
        error: null,
      },
      sales_line_territories: {
        data: {
          id: 'slt-bc',
          sales_line_id: 'line-ogr',
          territory_id: 'geo-bc',
          status: 'active',
        },
        error: null,
      },
      territories: { data: BC_GEO, error: null },
    });
    const market = await resolvePricingMarketForRetailerLineAccount(client, 'rla-bc');
    expect(market.publicMarket).toBe('ca');
    expect(market.showCanadianRetail).toBe(true);
    expect(market.territoryCode).toBe('bc');
  });

  it('hides CAD when the RLA has no assignment', async () => {
    const client = mockClient({
      retailer_line_accounts: {
        data: {
          id: 'rla-1',
          sales_line_id: 'line-ogr',
          sales_line_territory_id: null,
          relationship_status: 'active',
        },
        error: null,
      },
    });
    const market = await resolvePricingMarketForRetailerLineAccount(client, 'rla-1');
    expect(market.source).toBe('unknown');
    expect(market.showCanadianRetail).toBe(false);
    expect(market.showUsdWholesale).toBe(true);
  });
});

describe('resolvePricingMarketForProspectSalesLine', () => {
  it('defaults to Canadian paths when the prospect has no RLA', async () => {
    const client = mockClient({
      retailer_line_accounts: { data: null, error: null },
    });
    const market = await resolvePricingMarketForProspectSalesLine(client, {
      retailerId: 42,
      salesLineId: 'line-ogr',
    });
    expect(market.publicMarket).toBe('ca');
    expect(market.source).toBe('public_path');
  });
});

describe('resolvePricingMarketForBuyerProspect', () => {
  it('returns null when the buyer has no OGR RLA so the URL stays path-authoritative', async () => {
    const client = mockClient({
      lines: { data: { id: 'line-ogr' }, error: null },
      retailer_line_accounts: { data: null, error: null },
    });
    await expect(resolvePricingMarketForBuyerProspect(client, 42)).resolves.toBeNull();
  });
});

describe('resolveOgrPricingMarketForProductEmailDraft', () => {
  it('uses the current RLA assignment when it is valid', async () => {
    const { resolveOgrPricingMarketForProductEmailDraft } =
      await import('@/lib/resolveAccountPricingMarket');
    const client = mockClient({
      lines: { data: { id: 'line-ogr' }, error: null },
      retailer_line_accounts: {
        data: {
          id: 'rla-1',
          sales_line_id: 'line-ogr',
          sales_line_territory_id: 'slt-or',
          relationship_status: 'active',
        },
        error: null,
      },
      sales_line_territories: { data: OR_SLT, error: null },
      territories: { data: OR_GEO, error: null },
    });
    const market = await resolveOgrPricingMarketForProductEmailDraft(client, {
      prospectId: 42,
      payloadMarket: 'ca',
    });
    expect(market.publicMarket).toBe('us');
    expect(market.source).toBe('rla_territory_assignment');
  });

  it('does not fall back to Canada when the assignment is missing', async () => {
    const { resolveOgrPricingMarketForProductEmailDraft } =
      await import('@/lib/resolveAccountPricingMarket');
    const client = mockClient({
      lines: { data: { id: 'line-ogr' }, error: null },
      retailer_line_accounts: {
        data: {
          id: 'rla-1',
          sales_line_id: 'line-ogr',
          sales_line_territory_id: null,
          relationship_status: 'active',
        },
        error: null,
      },
    });
    const market = await resolveOgrPricingMarketForProductEmailDraft(client, {
      prospectId: 42,
      payloadMarket: 'ca',
    });
    expect(market.source).toBe('unknown');
    expect(market.publicMarket).toBe('us');
    expect(market.showCanadianRetail).toBe(false);
  });

  it('honors a stamped U.S. payload market when there is no RLA', async () => {
    const { resolveOgrPricingMarketForProductEmailDraft } =
      await import('@/lib/resolveAccountPricingMarket');
    const client = mockClient({
      lines: { data: { id: 'line-ogr' }, error: null },
      retailer_line_accounts: { data: null, error: null },
    });
    const market = await resolveOgrPricingMarketForProductEmailDraft(client, {
      prospectId: 42,
      payloadMarket: 'us',
    });
    expect(market.publicMarket).toBe('us');
    expect(market.source).toBe('staff_selector');
  });
});
