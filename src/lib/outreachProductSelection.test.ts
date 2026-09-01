import { describe, expect, it } from 'vitest';
import {
  buildOutreachProductPool,
  selectProductForProspect,
  selectProductsForProspect,
  classifyMatchPoolEmpty,
} from '@/lib/outreachProductSelection';
import { AGENT_OUTREACH_TOP_RANK_LIMIT } from '@/lib/outreachSelectionConstants';

function row(
  partial: Partial<{
    id: string;
    sku: string;
    name: string;
    public_slug: string | null;
    status: string;
    is_publicly_published: boolean;
    is_new: boolean;
    public_sort_order: number | null;
    recommended_channels: string[];
    lifestyle_themes: string[];
  }> & { id: string; sku: string; name: string },
) {
  return {
    public_slug: partial.public_slug ?? partial.sku.toLowerCase(),
    status: partial.status ?? 'active',
    is_publicly_published: partial.is_publicly_published ?? true,
    is_new: partial.is_new ?? false,
    public_sort_order: partial.public_sort_order ?? 0,
    recommended_channels: partial.recommended_channels ?? [],
    lifestyle_themes: partial.lifestyle_themes ?? [],
    ...partial,
  };
}

describe('buildOutreachProductPool', () => {
  it('includes Top-N by absolute sales rank and New outside Top-N', () => {
    const rows = [
      row({ id: '1', sku: 'A', name: 'Alpha', public_sort_order: 1 }),
      row({ id: '2', sku: 'B', name: 'Beta', public_sort_order: 2 }),
      row({
        id: '31',
        sku: 'Z',
        name: 'Zulu New',
        public_sort_order: 500,
        is_new: true,
      }),
      row({ id: '99', sku: 'X', name: 'Excluded', public_sort_order: 400, is_new: false }),
    ];
    // Build many ranked products so 99 is outside top 30
    const ranked = Array.from({ length: AGENT_OUTREACH_TOP_RANK_LIMIT }, (_, i) =>
      row({
        id: `r${i + 1}`,
        sku: `R${i + 1}`,
        name: `Ranked ${i + 1}`,
        public_sort_order: i + 1,
      }),
    );
    const pool = buildOutreachProductPool([...ranked, rows[2]!, rows[3]!]);
    expect(pool.some((p) => p.id === 'r1')).toBe(true);
    expect(pool.some((p) => p.id === '31')).toBe(true);
    expect(pool.some((p) => p.id === '99')).toBe(false);
    expect(pool.every((p) => (p.salesRank != null && p.salesRank <= 30) || p.isNew)).toBe(true);
  });

  it('drops unpublished or inactive products', () => {
    const pool = buildOutreachProductPool([
      row({ id: '1', sku: 'A', name: 'A', public_sort_order: 1, status: 'inactive' }),
      row({
        id: '2',
        sku: 'B',
        name: 'B',
        public_sort_order: 1,
        is_publicly_published: false,
      }),
      row({ id: '3', sku: 'C', name: 'C', public_sort_order: 1, public_slug: '' }),
      row({ id: '4', sku: 'D', name: 'D', public_sort_order: 1 }),
    ]);
    expect(pool.map((p) => p.id)).toEqual(['4']);
  });
});

describe('selectProductForProspect', () => {
  const pool = buildOutreachProductPool([
    row({
      id: 'golf',
      sku: 'G1',
      name: 'Golf Tee',
      public_sort_order: 1,
      recommended_channels: ['golf_retail'],
    }),
    row({
      id: 'marine',
      sku: 'M1',
      name: 'Marine Tee',
      public_sort_order: 2,
      recommended_channels: ['marine_retail'],
    }),
    row({
      id: 'global',
      sku: 'X1',
      name: 'Global',
      public_sort_order: 3,
      recommended_channels: [],
      is_new: true,
    }),
  ]);

  it('prefers channel intersection', () => {
    const picked = selectProductForProspect(pool, { prospectChannels: ['marine_retail'] });
    expect(picked?.product.id).toBe('marine');
    expect(picked?.productFit).toBe('channel_intersect');
  });

  it('falls back to empty recommended-channel products', () => {
    const picked = selectProductForProspect(pool, {
      prospectChannels: ['brewery_distillery_bbq'],
    });
    expect(picked?.product.id).toBe('global');
    expect(picked?.productFit).toBe('global_fallback');
  });

  it('prefers invoice top-volume catalog id when in pool', () => {
    const picked = selectProductForProspect(pool, {
      prospectChannels: ['marine_retail'],
      preferredCatalogItemIds: ['golf'],
    });
    expect(picked?.product.id).toBe('golf');
    expect(picked?.productFit).toBe('channel_intersect');
  });

  it('preserves rank order when product weights are uniform', () => {
    const golfPool = buildOutreachProductPool([
      row({
        id: 'golf-a',
        sku: 'GA',
        name: 'Golf A',
        public_sort_order: 1,
        recommended_channels: ['golf_retail'],
      }),
      row({
        id: 'golf-b',
        sku: 'GB',
        name: 'Golf B',
        public_sort_order: 2,
        recommended_channels: ['golf_retail'],
      }),
    ]);
    const picked = selectProductForProspect(golfPool, {
      prospectChannels: ['golf_retail'],
      productWeightSource: 'uniform',
    });
    expect(picked?.product.id).toBe('golf-a');
  });

  it('prefers higher-weight product within channel_intersect tier', () => {
    const golfPool = buildOutreachProductPool([
      row({
        id: 'golf-a',
        sku: 'GA',
        name: 'Golf A',
        public_sort_order: 1,
        recommended_channels: ['golf_retail'],
      }),
      row({
        id: 'golf-b',
        sku: 'GB',
        name: 'Golf B',
        public_sort_order: 2,
        recommended_channels: ['golf_retail'],
      }),
    ]);
    const weights = new Map([
      ['golf-a', 0.01],
      ['golf-b', 0.05],
    ]);
    const picked = selectProductForProspect(golfPool, {
      prospectChannels: ['golf_retail'],
      productWeights: weights,
      globalProductWeight: 0.015,
      productWeightSource: 'measured',
    });
    expect(picked?.product.id).toBe('golf-b');
    expect(picked?.productFit).toBe('channel_intersect');
  });

  it('keeps channel_intersect tier over higher-weight non-intersect product', () => {
    const mixedPool = buildOutreachProductPool([
      row({
        id: 'golf-a',
        sku: 'GA',
        name: 'Golf A',
        public_sort_order: 1,
        recommended_channels: ['golf_retail'],
      }),
      row({
        id: 'marine-a',
        sku: 'MA',
        name: 'Marine A',
        public_sort_order: 2,
        recommended_channels: ['marine_retail'],
      }),
    ]);
    const weights = new Map([
      ['golf-a', 0.01],
      ['marine-a', 0.1],
    ]);
    const picked = selectProductForProspect(mixedPool, {
      prospectChannels: ['golf_retail'],
      productWeights: weights,
      globalProductWeight: 0.015,
      productWeightSource: 'measured',
    });
    expect(picked?.product.id).toBe('golf-a');
    expect(picked?.productFit).toBe('channel_intersect');
  });

  it('ignores measured weights when globalProductWeight is missing', () => {
    const golfPool = buildOutreachProductPool([
      row({
        id: 'golf-a',
        sku: 'GA',
        name: 'Golf A',
        public_sort_order: 1,
        recommended_channels: ['golf_retail'],
      }),
      row({
        id: 'golf-b',
        sku: 'GB',
        name: 'Golf B',
        public_sort_order: 2,
        recommended_channels: ['golf_retail'],
      }),
    ]);
    const weights = new Map([
      ['golf-a', 0.01],
      ['golf-b', 0.05],
    ]);
    const picked = selectProductForProspect(golfPool, {
      prospectChannels: ['golf_retail'],
      productWeights: weights,
      productWeightSource: 'measured',
    });
    expect(picked?.product.id).toBe('golf-a');
  });

  it('skips excluded catalog items and picks next-best', () => {
    const golfPool = buildOutreachProductPool([
      row({
        id: 'golf-a',
        sku: 'GA',
        name: 'Golf A',
        public_sort_order: 1,
        recommended_channels: ['golf_retail'],
      }),
      row({
        id: 'golf-b',
        sku: 'GB',
        name: 'Golf B',
        public_sort_order: 2,
        recommended_channels: ['golf_retail'],
      }),
    ]);
    const picked = selectProductForProspect(golfPool, {
      prospectChannels: ['golf_retail'],
      excludeCatalogItemIds: new Set(['golf-a']),
    });
    expect(picked?.product.id).toBe('golf-b');
    expect(picked?.productFit).toBe('channel_intersect');
  });
});

describe('selectProductsForProspect', () => {
  const pool = buildOutreachProductPool([
    row({
      id: 'golf-a',
      sku: 'GA',
      name: 'Golf A',
      public_sort_order: 1,
      recommended_channels: ['golf_retail'],
    }),
    row({
      id: 'golf-b',
      sku: 'GB',
      name: 'Golf B',
      public_sort_order: 2,
      recommended_channels: ['golf_retail'],
    }),
    row({
      id: 'golf-c',
      sku: 'GC',
      name: 'Golf C',
      public_sort_order: 3,
      recommended_channels: ['golf_retail'],
    }),
    row({
      id: 'marine-a',
      sku: 'MA',
      name: 'Marine A',
      public_sort_order: 4,
      recommended_channels: ['marine_retail'],
    }),
  ]);

  it('returns up to three distinct products', () => {
    const picks = selectProductsForProspect(pool, { prospectChannels: ['golf_retail'] }, 3);
    expect(picks).toHaveLength(3);
    expect(new Set(picks.map((p) => p.product.id)).size).toBe(3);
    expect(picks[0]?.product.id).toBe('golf-a');
    expect(picks[1]?.product.id).toBe('golf-b');
    expect(picks[2]?.product.id).toBe('golf-c');
  });

  it('respects exclude set across multiple picks', () => {
    const picks = selectProductsForProspect(
      pool,
      {
        prospectChannels: ['golf_retail'],
        excludeCatalogItemIds: new Set(['golf-a', 'golf-b']),
      },
      3,
    );
    expect(picks.length).toBeGreaterThanOrEqual(1);
    expect(picks[0]?.product.id).toBe('golf-c');
    expect(picks.some((pick) => pick.product.id === 'golf-a')).toBe(false);
    expect(picks.some((pick) => pick.product.id === 'golf-b')).toBe(false);
  });
});

describe('classifyMatchPoolEmpty', () => {
  const pool = buildOutreachProductPool([
    row({ id: '1', sku: 'A', name: 'A', public_sort_order: 1 }),
  ]);

  it('detects empty published pool', () => {
    expect(classifyMatchPoolEmpty([])).toBe('no_eligible_products');
  });

  it('detects all-recently-emailed when dedup excludes entire pool', () => {
    expect(classifyMatchPoolEmpty(pool, new Set(['1']))).toBe('all_recently_emailed');
  });

  it('returns null when eligible products remain', () => {
    expect(classifyMatchPoolEmpty(pool, new Set(['other']))).toBeNull();
  });
});
