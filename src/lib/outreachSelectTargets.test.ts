import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatOutreachPreparationDate, selectOutreachTargets } from '@/lib/outreachSelectTargets';
import type { Database } from '@/types/database';

type DbClient = SupabaseClient<Database>;

function thenable<T extends Record<string, unknown>>(
  methods: T,
  result: { data: unknown; error: unknown },
): T & PromiseLike<{ data: unknown; error: unknown }> {
  return {
    ...methods,
    then(onFulfilled, onRejected) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
}

function chain(result: { data: unknown; error: unknown }) {
  const api: Record<string, unknown> = {};
  const self = () => thenable(api, result);
  for (const key of ['select', 'eq', 'in', 'not', 'neq', 'or', 'order', 'limit', 'gte']) {
    api[key] = vi.fn(self);
  }
  api.maybeSingle = vi.fn(async () => result);
  return thenable(api, result);
}

function prospectRow(id: number, name: string, extras: Record<string, unknown> = {}) {
  return {
    id,
    name,
    category: 'golf_retail',
    region: 'BC',
    city: 'Vancouver',
    address: '',
    phone: '',
    fit: '',
    account_status: 'prospect',
    converted_at: null,
    initial_order_date: null,
    notes: null,
    territory_id: 't1',
    operational_territory_id: extras.operational_territory_id ?? null,
    territories: { code: 'BC', name: 'BC' },
    operational_territories: null,
    external_id: null,
    subterritory: null,
    primary_district: null,
    retail_category: null,
    website: null,
    fit_score: 8,
    ideal_opening_units: null,
    priority: 'Tier 1',
    provisional_grade: 'A (provisional)',
    verification_status: null,
    buyer_verified: false,
    import_protected: false,
    apparel_capability: null,
    existing_ogr: null,
    qualification_status: null,
    next_action: null,
    source_note: null,
    postal_code: null,
    secondary_channels: [],
    retail_subchannels: [],
    venue_contexts: [],
    lifestyle_themes: [],
    retail_capabilities: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...extras,
  };
}

function mockSelectClient(opts: {
  prospects?: unknown[];
  rlaRows?: unknown[];
  contacts?: unknown[];
  catalogItems?: unknown[];
  pendingProspectIds?: Array<{ prospect_id: number }>;
  suppressed?: unknown[];
  sendsByProspect?: unknown[];
  sendsByEmail?: unknown[];
  recentProductSends?: unknown[];
}): DbClient {
  const lineId = 'line-ogr';
  let sendQueryCount = 0;

  const from = vi.fn((table: string) => {
    if (table === 'prospects') {
      return chain({ data: opts.prospects ?? [], error: null });
    }
    if (table === 'lines') {
      return chain({ data: { id: lineId }, error: null });
    }
    if (table === 'retailer_line_accounts') {
      return chain({
        data:
          opts.rlaRows ??
          (opts.prospects ?? []).map((p) => {
            const row = p as { id: number; account_status?: string };
            return {
              retailer_id: row.id,
              relationship_status: row.account_status === 'active_account' ? 'opened' : 'prospect',
              line_account_markers: [],
            };
          }),
        error: null,
      });
    }
    if (table === 'catalog_items') {
      return chain({ data: opts.catalogItems ?? [], error: null });
    }
    if (table === 'account_contacts') {
      return chain({ data: opts.contacts ?? [], error: null });
    }
    if (table === 'system_messages') {
      return {
        select: (cols: string) => {
          if (cols === 'prospect_id') {
            return chain({ data: opts.pendingProspectIds ?? [], error: null });
          }
          if (cols.includes('bounced_at')) {
            return chain({ data: opts.suppressed ?? [], error: null });
          }
          if (cols.includes('catalog_item_id')) {
            return chain({ data: opts.recentProductSends ?? [], error: null });
          }
          // sent_at queries
          sendQueryCount += 1;
          const data =
            sendQueryCount === 1
              ? (opts.sendsByProspect ?? [])
              : (opts.sendsByEmail ?? opts.sendsByProspect ?? []);
          return chain({ data, error: null });
        },
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });

  return { from } as unknown as DbClient;
}

describe('formatOutreachPreparationDate', () => {
  it('formats YYYY-MM-DD in America/Vancouver', () => {
    const date = new Date('2026-08-12T10:00:00Z');
    expect(formatOutreachPreparationDate(date, 'America/Vancouver')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('selectOutreachTargets', () => {
  it('returns empty targets when capacity is 0', async () => {
    const client = mockSelectClient({});
    const result = await selectOutreachTargets(client, {
      capacity: 0,
      preparationDate: '2026-08-12',
    });
    expect(result).toEqual({ ok: true, targets: [], excluded: [] });
  });

  it('selects an eligible prospect with Top/New product into frozen DTO', async () => {
    const client = mockSelectClient({
      prospects: [prospectRow(10, 'Golf Shop')],
      contacts: [
        {
          id: 'c-1',
          account_id: 10,
          role: 'buyer',
          full_name: 'Sam Buyer',
          title: null,
          phone: null,
          email: 'sam@example.com',
          is_primary: true,
          notes: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      catalogItems: [
        {
          id: 'p-1',
          sku: 'OG1',
          name: 'Golf Tee',
          public_slug: 'golf-tee',
          status: 'active',
          is_publicly_published: true,
          is_new: false,
          public_sort_order: 1,
          recommended_channels: ['golf_retail'],
          lifestyle_themes: [],
          line_id: 'line-ogr',
        },
      ],
      pendingProspectIds: [],
      suppressed: [],
      sendsByProspect: [],
      sendsByEmail: [],
    });

    const result = await selectOutreachTargets(client, {
      capacity: 5,
      preparationDate: '2026-08-12',
      asOf: new Date('2026-08-12T18:00:00Z'),
      weights: { golf_retail: 1 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.targets).toHaveLength(1);
    expect(result.targets[0]).toEqual(
      expect.objectContaining({
        preparationDate: '2026-08-12',
        prospectId: 10,
        prospectName: 'Golf Shop',
        accountContactId: 'c-1',
        toEmail: 'sam@example.com',
        toName: 'Sam Buyer',
        catalogItemId: 'p-1',
        productSku: 'OG1',
        productSlug: 'golf-tee',
        selectionReasons: expect.objectContaining({
          exclusionsChecked: true,
          productFit: 'channel_intersect',
          channelMatch: true,
        }),
      }),
    );
  });

  it('excludes pending agent drafts and invalid emails', async () => {
    const client = mockSelectClient({
      prospects: [prospectRow(1, 'Pending'), prospectRow(2, 'No Email')],
      contacts: [
        {
          id: 'c-2',
          account_id: 2,
          role: 'buyer',
          full_name: 'No Mail',
          title: null,
          phone: null,
          email: 'bad',
          is_primary: true,
          notes: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      catalogItems: [
        {
          id: 'p-1',
          sku: 'OG1',
          name: 'Tee',
          public_slug: 'tee',
          status: 'active',
          is_publicly_published: true,
          is_new: true,
          public_sort_order: 0,
          recommended_channels: [],
          lifestyle_themes: [],
          line_id: 'line-ogr',
        },
      ],
      pendingProspectIds: [{ prospect_id: 1 }],
      suppressed: [],
    });

    const result = await selectOutreachTargets(client, {
      capacity: 5,
      preparationDate: '2026-08-12',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targets).toHaveLength(0);
    expect(result.excluded).toEqual(
      expect.arrayContaining([
        { prospectId: 1, reason: 'pending_agent_draft' },
        { prospectId: 2, reason: 'no_usable_email' },
      ]),
    );
  });

  it('excludes prospects with suppressed email or prospect id', async () => {
    const client = mockSelectClient({
      prospects: [prospectRow(10, 'Bounced Shop'), prospectRow(11, 'Clean Shop')],
      contacts: [
        {
          id: 'c-10',
          account_id: 10,
          role: 'buyer',
          full_name: 'Sam',
          title: null,
          phone: null,
          email: 'bounced@example.com',
          is_primary: true,
          notes: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'c-11',
          account_id: 11,
          role: 'buyer',
          full_name: 'Pat',
          title: null,
          phone: null,
          email: 'clean@example.com',
          is_primary: true,
          notes: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      catalogItems: [
        {
          id: 'p-1',
          sku: 'OG1',
          name: 'Tee',
          public_slug: 'tee',
          status: 'active',
          is_publicly_published: true,
          is_new: true,
          public_sort_order: 0,
          recommended_channels: [],
          lifestyle_themes: [],
          line_id: 'line-ogr',
        },
      ],
      pendingProspectIds: [],
      suppressed: [
        {
          prospect_id: 10,
          to_email: 'bounced@example.com',
          status: 'bounced',
          bounced_at: '2026-01-01T00:00:00Z',
          complained_at: null,
        },
      ],
      sendsByProspect: [],
      sendsByEmail: [],
    });

    const result = await selectOutreachTargets(client, {
      capacity: 5,
      preparationDate: '2026-08-12',
      asOf: new Date('2026-08-12T18:00:00Z'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.excluded).toEqual(
      expect.arrayContaining([{ prospectId: 10, reason: 'contact_suppressed' }]),
    );
    expect(result.targets.map((t) => t.prospectId)).toEqual([11]);
  });

  it('excludes prospects inside the outreach cooldown window', async () => {
    const client = mockSelectClient({
      prospects: [prospectRow(20, 'Recent Send')],
      contacts: [
        {
          id: 'c-20',
          account_id: 20,
          role: 'buyer',
          full_name: 'Sam',
          title: null,
          phone: null,
          email: 'recent@example.com',
          is_primary: true,
          notes: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      catalogItems: [
        {
          id: 'p-1',
          sku: 'OG1',
          name: 'Tee',
          public_slug: 'tee',
          status: 'active',
          is_publicly_published: true,
          is_new: true,
          public_sort_order: 0,
          recommended_channels: [],
          lifestyle_themes: [],
          line_id: 'line-ogr',
        },
      ],
      pendingProspectIds: [],
      suppressed: [],
      sendsByProspect: [
        {
          prospect_id: 20,
          to_email: 'recent@example.com',
          sent_at: '2026-08-10T12:00:00Z',
        },
      ],
      sendsByEmail: [],
    });

    const result = await selectOutreachTargets(client, {
      capacity: 5,
      preparationDate: '2026-08-12',
      asOf: new Date('2026-08-12T18:00:00Z'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targets).toHaveLength(0);
    expect(result.excluded).toEqual(
      expect.arrayContaining([{ prospectId: 20, reason: 'cooldown' }]),
    );
  });

  it('includes opted-in reactivation candidates and keeps ordinary prospects', async () => {
    const client = mockSelectClient({
      prospects: [
        prospectRow(10, 'Golf Shop'),
        prospectRow(11, 'No Opt In', { account_status: 'active_account', fit_score: null }),
        prospectRow(12, 'Opted In', { account_status: 'active_account', fit_score: null }),
        prospectRow(13, 'Unresponsive', { account_status: 'active_account', fit_score: null }),
        prospectRow(14, 'Parked', { account_status: 'inactive', fit_score: null }),
      ],
      rlaRows: [
        { retailer_id: 10, relationship_status: 'prospect', line_account_markers: [] },
        {
          retailer_id: 11,
          relationship_status: 'opened',
          line_account_markers: ['historical_purchaser', 'reactivation_candidate'],
        },
        {
          retailer_id: 12,
          relationship_status: 'opened',
          line_account_markers: [
            'historical_purchaser',
            'reactivation_candidate',
            'outreach_eligible',
          ],
        },
        {
          retailer_id: 13,
          relationship_status: 'opened',
          line_account_markers: [
            'historical_purchaser',
            'reactivation_candidate',
            'outreach_eligible',
            'reactivation_unresponsive',
          ],
        },
        {
          retailer_id: 14,
          relationship_status: 'inactive',
          line_account_markers: ['historical_purchaser', 'reactivation_unresponsive'],
        },
      ],
      contacts: [
        {
          id: 'c-10',
          account_id: 10,
          role: 'buyer',
          full_name: 'Sam Buyer',
          title: null,
          phone: null,
          email: 'sam@example.com',
          is_primary: true,
          notes: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'c-12',
          account_id: 12,
          role: 'buyer',
          full_name: 'Pat Buyer',
          title: null,
          phone: null,
          email: 'pat@example.com',
          is_primary: true,
          notes: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      catalogItems: [
        {
          id: 'p-1',
          sku: 'OG1',
          name: 'Tee',
          public_slug: 'tee',
          status: 'active',
          is_publicly_published: true,
          is_new: true,
          public_sort_order: 0,
          recommended_channels: [],
          lifestyle_themes: [],
          line_id: 'line-ogr',
        },
      ],
      pendingProspectIds: [],
      suppressed: [],
      sendsByProspect: [],
      sendsByEmail: [],
    });

    const result = await selectOutreachTargets(client, {
      capacity: 5,
      preparationDate: '2026-08-12',
      asOf: new Date('2026-08-12T18:00:00Z'),
      weights: { golf_retail: 1 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targets.map((t) => t.prospectId).sort((a, b) => a - b)).toEqual([10, 12]);
    expect(result.excluded.map((e) => e.prospectId)).not.toEqual(
      expect.arrayContaining([11, 13, 14]),
    );
  });

  it('honors precomputed channelAllocation without recomputing slots', async () => {
    const client = mockSelectClient({
      prospects: [
        prospectRow(10, 'Golf Shop', { category: 'golf_retail', fit_score: 7 }),
        prospectRow(11, 'Marine Shop', { category: 'marine_retail', fit_score: 9 }),
      ],
      contacts: [
        {
          id: 'c-1',
          account_id: 10,
          name: 'Sam',
          email: 'sam@example.com',
          phone: '',
          role: 'buyer',
          is_primary: true,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'c-2',
          account_id: 11,
          name: 'Pat',
          email: 'pat@example.com',
          phone: '',
          role: 'buyer',
          is_primary: true,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      catalogItems: [
        {
          id: 'p-1',
          sku: 'OG1',
          name: 'Golf Tee',
          public_slug: 'golf-tee',
          status: 'active',
          is_publicly_published: true,
          is_new: false,
          public_sort_order: 1,
          recommended_channels: ['golf_retail'],
          lifestyle_themes: [],
          line_id: 'line-ogr',
        },
        {
          id: 'p-2',
          sku: 'OG2',
          name: 'Marine Tee',
          public_slug: 'marine-tee',
          status: 'active',
          is_publicly_published: true,
          is_new: false,
          public_sort_order: 2,
          recommended_channels: ['marine_retail'],
          lifestyle_themes: [],
          line_id: 'line-ogr',
        },
      ],
      pendingProspectIds: [],
      suppressed: [],
      sendsByProspect: [],
      sendsByEmail: [],
    });

    const result = await selectOutreachTargets(client, {
      capacity: 1,
      preparationDate: '2026-08-12',
      asOf: new Date('2026-08-12T18:00:00Z'),
      channelAllocation: {
        channelOrder: ['golf_retail', 'marine_retail'],
        slotsByChannel: { golf_retail: 1, marine_retail: 0 },
        meta: { weightSource: 'measured' },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0].prospectId).toBe(10);
    expect(result.targets[0].primaryChannel).toBe('golf_retail');
  });

  it('records productWeightSource on selectionReasons when provided', async () => {
    const client = mockSelectClient({
      prospects: [prospectRow(10, 'Golf Shop')],
      contacts: [
        {
          id: 'c-1',
          account_id: 10,
          name: 'Sam',
          email: 'sam@example.com',
          phone: '',
          role: 'buyer',
          is_primary: true,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      catalogItems: [
        {
          id: 'p-1',
          sku: 'OG1',
          name: 'Golf Tee',
          public_slug: 'golf-tee',
          status: 'active',
          is_publicly_published: true,
          is_new: false,
          public_sort_order: 1,
          recommended_channels: ['golf_retail'],
          lifestyle_themes: [],
          line_id: 'line-ogr',
        },
      ],
      pendingProspectIds: [],
      suppressed: [],
      sendsByProspect: [],
      sendsByEmail: [],
    });

    const result = await selectOutreachTargets(client, {
      capacity: 1,
      preparationDate: '2026-08-12',
      asOf: new Date('2026-08-12T18:00:00Z'),
      productWeightSource: 'measured',
      productWeights: new Map([['p-1', 0.02]]),
      globalProductWeight: 0.015,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targets[0].selectionReasons.productWeightSource).toBe('measured');
  });

  it('records fitBandWeightSource on selectionReasons when provided', async () => {
    const client = mockSelectClient({
      prospects: [prospectRow(10, 'Golf Shop', { fit_score: 9 })],
      contacts: [
        {
          id: 'c-1',
          account_id: 10,
          name: 'Sam',
          email: 'sam@example.com',
          phone: '',
          role: 'buyer',
          is_primary: true,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      catalogItems: [
        {
          id: 'p-1',
          sku: 'OG1',
          name: 'Golf Tee',
          public_slug: 'golf-tee',
          status: 'active',
          is_publicly_published: true,
          is_new: false,
          public_sort_order: 1,
          recommended_channels: ['golf_retail'],
          lifestyle_themes: [],
          line_id: 'line-ogr',
        },
      ],
      pendingProspectIds: [],
      suppressed: [],
      sendsByProspect: [],
      sendsByEmail: [],
    });

    const result = await selectOutreachTargets(client, {
      capacity: 1,
      preparationDate: '2026-08-12',
      asOf: new Date('2026-08-12T18:00:00Z'),
      fitBandWeightSource: 'measured',
      fitBandWeights: new Map([['8-10', 0.02]]),
      globalFitBandWeight: 0.015,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targets[0].selectionReasons.fitBandWeightSource).toBe('measured');
  });

  it('picks alternate product when top pick was recently sent to prospect', async () => {
    const client = mockSelectClient({
      prospects: [prospectRow(10, 'Golf Shop')],
      contacts: [
        {
          id: 'c-1',
          account_id: 10,
          role: 'buyer',
          full_name: 'Sam Buyer',
          title: null,
          phone: null,
          email: 'sam@example.com',
          is_primary: true,
          notes: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      catalogItems: [
        {
          id: 'p-1',
          sku: 'OG1',
          name: 'Golf Tee A',
          public_slug: 'golf-tee-a',
          status: 'active',
          is_publicly_published: true,
          is_new: false,
          public_sort_order: 1,
          recommended_channels: ['golf_retail'],
          lifestyle_themes: [],
          line_id: 'line-ogr',
        },
        {
          id: 'p-2',
          sku: 'OG2',
          name: 'Golf Tee B',
          public_slug: 'golf-tee-b',
          status: 'active',
          is_publicly_published: true,
          is_new: false,
          public_sort_order: 2,
          recommended_channels: ['golf_retail'],
          lifestyle_themes: [],
          line_id: 'line-ogr',
        },
      ],
      pendingProspectIds: [],
      suppressed: [],
      sendsByProspect: [],
      sendsByEmail: [],
      recentProductSends: [{ prospect_id: 10, catalog_item_id: 'p-1' }],
    });

    const result = await selectOutreachTargets(client, {
      capacity: 1,
      preparationDate: '2026-08-12',
      asOf: new Date('2026-08-12T18:00:00Z'),
      weights: { golf_retail: 1 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0].catalogItemId).toBe('p-2');
  });

  it('excludes prospect when all pool products were recently sent', async () => {
    const client = mockSelectClient({
      prospects: [prospectRow(10, 'Golf Shop')],
      contacts: [
        {
          id: 'c-1',
          account_id: 10,
          role: 'buyer',
          full_name: 'Sam Buyer',
          title: null,
          phone: null,
          email: 'sam@example.com',
          is_primary: true,
          notes: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      catalogItems: [
        {
          id: 'p-1',
          sku: 'OG1',
          name: 'Golf Tee',
          public_slug: 'golf-tee',
          status: 'active',
          is_publicly_published: true,
          is_new: false,
          public_sort_order: 1,
          recommended_channels: ['golf_retail'],
          lifestyle_themes: [],
          line_id: 'line-ogr',
        },
      ],
      pendingProspectIds: [],
      suppressed: [],
      sendsByProspect: [],
      sendsByEmail: [],
      recentProductSends: [{ prospect_id: 10, catalog_item_id: 'p-1' }],
    });

    const result = await selectOutreachTargets(client, {
      capacity: 1,
      preparationDate: '2026-08-12',
      asOf: new Date('2026-08-12T18:00:00Z'),
      weights: { golf_retail: 1 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targets).toHaveLength(0);
    expect(result.excluded).toEqual(
      expect.arrayContaining([{ prospectId: 10, reason: 'no_product_after_dedup' }]),
    );
  });

  it('regional: filters ops + store geo, ranks by fit_score, hard limit without channel spill', async () => {
    const contact = (id: number, email: string) => ({
      id: `c-${id}`,
      account_id: id,
      role: 'buyer',
      full_name: `Buyer ${id}`,
      title: null,
      phone: null,
      email,
      is_primary: true,
      notes: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
    const client = mockSelectClient({
      prospects: [
        prospectRow(1, 'Low Fit OR West', {
          fit_score: 3,
          priority: 'Tier 1',
          operational_territory_id: 'ops-pnw-west',
          territories: { code: 'or', name: 'Oregon' },
        }),
        prospectRow(2, 'High Fit OR West', {
          fit_score: 9,
          priority: 'Tier 3',
          operational_territory_id: 'ops-pnw-west',
          territories: { code: 'or', name: 'Oregon' },
        }),
        prospectRow(3, 'Mid Fit WA West', {
          fit_score: 8,
          priority: 'Tier 1',
          operational_territory_id: 'ops-pnw-west',
          territories: { code: 'wa', name: 'Washington' },
        }),
        prospectRow(4, 'High Fit OR East', {
          fit_score: 10,
          priority: 'Tier 1',
          operational_territory_id: 'ops-pnw-east',
          territories: { code: 'or', name: 'Oregon' },
        }),
      ],
      contacts: [
        contact(1, 'a@example.com'),
        contact(2, 'b@example.com'),
        contact(3, 'c@example.com'),
        contact(4, 'd@example.com'),
      ],
      catalogItems: [
        {
          id: 'p-1',
          sku: 'OG1',
          name: 'Tee',
          public_slug: 'tee',
          status: 'active',
          is_publicly_published: true,
          is_new: true,
          public_sort_order: 0,
          recommended_channels: [],
          lifestyle_themes: [],
          line_id: 'line-ogr',
        },
      ],
    });

    const result = await selectOutreachTargets(client, {
      capacity: 2,
      preparationDate: '2026-08-25',
      asOf: new Date('2026-08-25T18:00:00Z'),
      operationalTerritoryId: 'ops-pnw-west',
      storeTerritoryCode: 'or',
      rankMode: 'fit_score',
      skipChannelAllocation: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targets.map((t) => t.prospectId)).toEqual([2, 1]);
    expect(result.excluded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ prospectId: 3, reason: 'outside_store_territory' }),
        expect.objectContaining({ prospectId: 4, reason: 'outside_ops_territory' }),
      ]),
    );
  });

  it('regional: includes lookalike_prospect without outreach_eligible when ops filter set', async () => {
    const client = mockSelectClient({
      prospects: [
        prospectRow(20, 'Lookalike OR', {
          fit_score: 7,
          operational_territory_id: 'ops-pnw-west',
          territories: { code: 'or', name: 'Oregon' },
        }),
      ],
      rlaRows: [
        {
          retailer_id: 20,
          relationship_status: 'prospect',
          line_account_markers: ['lookalike_prospect'],
        },
      ],
      contacts: [
        {
          id: 'c-20',
          account_id: 20,
          role: 'buyer',
          full_name: 'Buyer 20',
          title: null,
          phone: null,
          email: 'lookalike@example.com',
          is_primary: true,
          notes: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      catalogItems: [
        {
          id: 'p-1',
          sku: 'OG1',
          name: 'Tee',
          public_slug: 'tee',
          status: 'active',
          is_publicly_published: true,
          is_new: true,
          public_sort_order: 0,
          recommended_channels: [],
          lifestyle_themes: [],
          line_id: 'line-ogr',
        },
      ],
    });

    const blocked = await selectOutreachTargets(client, {
      capacity: 5,
      preparationDate: '2026-08-25',
      asOf: new Date('2026-08-25T18:00:00Z'),
    });
    expect(blocked.ok).toBe(true);
    if (blocked.ok) expect(blocked.targets).toHaveLength(0);

    const regional = await selectOutreachTargets(client, {
      capacity: 5,
      preparationDate: '2026-08-25',
      asOf: new Date('2026-08-25T18:00:00Z'),
      operationalTerritoryId: 'ops-pnw-west',
      storeTerritoryCode: 'or',
      rankMode: 'fit_score',
      skipChannelAllocation: true,
    });
    expect(regional.ok).toBe(true);
    if (!regional.ok) return;
    expect(regional.targets.map((t) => t.prospectId)).toEqual([20]);
  });
});
