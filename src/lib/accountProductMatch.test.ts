import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadSnapshotMock = vi.fn();
const loadPoolMock = vi.fn();
const fetchDedupMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('@/lib/accountResearch/snapshot', () => ({
  loadAccountResearchSnapshot: (...args: unknown[]) => loadSnapshotMock(...args),
}));

vi.mock('@/lib/outreachProductSelection', async () => {
  const actual = await vi.importActual<typeof import('@/lib/outreachProductSelection')>(
    '@/lib/outreachProductSelection',
  );
  return {
    ...actual,
    loadOutreachProductPool: (...args: unknown[]) => loadPoolMock(...args),
  };
});

vi.mock('@/lib/systemMessages', () => ({
  fetchRecentProductOutreachCatalogIdsByProspect: (...args: unknown[]) => fetchDedupMock(...args),
}));

import {
  assertResearchEligibleForMatch,
  createAccountProductMatch,
} from '@/lib/accountProductMatch';

const RESEARCH_RUN_ID = '00000000-0000-4000-8000-000000000101';
const LINE_ID = '00000000-0000-4000-8000-000000000301';
const CITATION_ID = '00000000-0000-4000-8000-000000000201';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000401';

function freshSnapshot(overrides: Record<string, unknown> = {}) {
  const completedAt = new Date().toISOString();
  return {
    run: {
      id: RESEARCH_RUN_ID,
      retailer_id: 42,
      status: 'succeeded',
      identity_confidence: 'high',
      completed_at: completedAt,
      ...overrides,
    },
    sources: [],
    citationsBySourceId: {
      s1: [
        {
          id: CITATION_ID,
          acceptance_status: 'accepted',
          source_url: 'https://trailoutfitters.com',
          platform: 'website',
          confidence: 'high',
          title: 'Trail Outfitters',
          excerpt: 'Outdoor retailer',
        },
      ],
    },
    sourceFreshness: {},
  };
}

function makeSupabase() {
  const prospectRow = {
    id: 42,
    name: 'Trail Outfitters',
    category: 'golf_retail',
    region: 'OR',
    city: 'Bend',
    address: '',
    phone: '',
    fit: '',
    account_status: 'prospect',
    converted_at: null,
    initial_order_date: null,
    notes: null,
    territory_id: '00000000-0000-4000-8000-000000000001',
    operational_territory_id: null,
    territories: { code: 'or', name: 'Oregon' },
    operational_territories: null,
    external_id: null,
    subterritory: null,
    primary_district: null,
    retail_category: null,
    website: null,
    fit_score: null,
    ideal_opening_units: null,
    priority: null,
    provisional_grade: null,
    verification_status: null,
    buyer_verified: false,
    import_protected: false,
    apparel_capability: null,
    existing_ogr: false,
    qualification_status: null,
    next_action: null,
    source_note: null,
    postal_code: null,
    secondary_channels: [],
    retail_subchannels: [],
    venue_contexts: [],
    lifestyle_themes: [],
    retail_capabilities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return {
    from(table: string) {
      const api = {
        select: () => api,
        eq: () => api,
        in: () => api,
        order: () => api,
        maybeSingle: async () => {
          if (table === 'lines') return { data: { id: LINE_ID }, error: null };
          if (table === 'prospects') return { data: prospectRow, error: null };
          if (table === 'account_product_match_runs') {
            return {
              data: {
                id: 'match-run-1',
                retailer_id: 42,
                sales_line_id: LINE_ID,
                research_run_id: RESEARCH_RUN_ID,
                status: 'succeeded',
                empty_reason: null,
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
          if (table === 'account_research_runs') {
            return Promise.resolve({ count: 0, data: null, error: null }).then(
              onFulfilled,
              onRejected,
            );
          }
          if (table === 'account_product_match_items') {
            return Promise.resolve({
              data: [
                {
                  id: 'item-1',
                  match_run_id: 'match-run-1',
                  catalog_item_id: PRODUCT_ID,
                  rank: 1,
                  rationale: 'Good fit',
                  product_fit: 'channel_intersect',
                },
              ],
              error: null,
            }).then(onFulfilled, onRejected);
          }
          if (table === 'account_product_match_item_citations') {
            return Promise.resolve({
              data: [{ match_item_id: 'item-1', citation_id: CITATION_ID }],
              error: null,
            }).then(onFulfilled, onRejected);
          }
          if (table === 'catalog_items') {
            return Promise.resolve({
              data: [{ id: PRODUCT_ID, sku: 'SKU-1', name: 'Golf Tee' }],
              error: null,
            }).then(onFulfilled, onRejected);
          }
          return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
        },
      };
      return api;
    },
    rpc: rpcMock,
  };
}

describe('accountProductMatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadSnapshotMock.mockResolvedValue(freshSnapshot());
    loadPoolMock.mockResolvedValue({
      ok: true,
      pool: [
        {
          id: PRODUCT_ID,
          sku: 'SKU-1',
          name: 'Golf Tee',
          publicSlug: 'golf-tee',
          isNew: false,
          publicSortOrder: 1,
          recommendedChannels: ['golf_retail'],
          lifestyleThemes: [],
          salesRank: 1,
        },
      ],
    });
    fetchDedupMock.mockResolvedValue({ ok: true, byProspectId: new Map() });
    rpcMock.mockResolvedValue({ data: { ok: true, match_run_id: 'match-run-1' }, error: null });
  });

  it('blocks identity unresolved research', async () => {
    loadSnapshotMock.mockResolvedValue(freshSnapshot({ identity_confidence: 'medium' }));
    const supabase = makeSupabase();
    const result = await assertResearchEligibleForMatch(supabase as never, {
      researchRunId: RESEARCH_RUN_ID,
      retailerId: 42,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.outcome).toBe('identity_unresolved');
    }
  });

  it('blocks when no accepted citations exist', async () => {
    loadSnapshotMock.mockResolvedValue({
      ...freshSnapshot(),
      citationsBySourceId: { s1: [] },
    });
    const result = await assertResearchEligibleForMatch(makeSupabase() as never, {
      researchRunId: RESEARCH_RUN_ID,
      retailerId: 42,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.outcome).toBe('no_accepted_evidence');
    }
  });

  it('returns all_recently_emailed when dedup excludes the pool', async () => {
    fetchDedupMock.mockResolvedValue({
      ok: true,
      byProspectId: new Map([[42, new Set([PRODUCT_ID])]]),
    });
    const result = await createAccountProductMatch({
      supabase: makeSupabase() as never,
      retailerId: 42,
      salesLineId: LINE_ID,
      researchRunId: RESEARCH_RUN_ID,
      useModel: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.outcome === 'empty') {
      expect(result.empty_reason).toBe('all_recently_emailed');
    }
    expect(rpcMock).toHaveBeenCalledWith(
      'persist_account_product_match_run',
      expect.objectContaining({
        p_status: 'empty',
        p_empty_reason: 'all_recently_emailed',
      }),
    );
  });

  it('returns no_eligible_products when pool is empty', async () => {
    loadPoolMock.mockResolvedValue({ ok: true, pool: [] });
    const result = await createAccountProductMatch({
      supabase: makeSupabase() as never,
      retailerId: 42,
      salesLineId: LINE_ID,
      researchRunId: RESEARCH_RUN_ID,
      useModel: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.outcome === 'empty') {
      expect(result.empty_reason).toBe('no_eligible_products');
    }
  });

  it('returns matched items with citation ids', async () => {
    const result = await createAccountProductMatch({
      supabase: makeSupabase() as never,
      retailerId: 42,
      salesLineId: LINE_ID,
      researchRunId: RESEARCH_RUN_ID,
      useModel: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.outcome === 'matched') {
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.citation_ids).toContain(CITATION_ID);
      expect(result.items[0]?.catalog_item_id).toBe(PRODUCT_ID);
    }
  });
});
