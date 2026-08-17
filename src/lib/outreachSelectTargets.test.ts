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
  for (const key of ['select', 'eq', 'in', 'not', 'or', 'order', 'limit']) {
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
    territories: { code: 'BC', name: 'BC' },
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
    apparel_capability: null,
    existing_ogr: null,
    qualification_status: null,
    next_action: null,
    source_note: null,
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
  contacts?: unknown[];
  catalogItems?: unknown[];
  pendingProspectIds?: Array<{ prospect_id: number }>;
  suppressed?: unknown[];
  sendsByProspect?: unknown[];
  sendsByEmail?: unknown[];
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
        data: (opts.prospects ?? []).map((p) => ({ retailer_id: (p as { id: number }).id })),
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
});
