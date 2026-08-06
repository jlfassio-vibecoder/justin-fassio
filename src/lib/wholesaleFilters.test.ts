import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WHOLESALE_FILTERS,
  filterPublicOgrProducts,
  parseWholesaleFilters,
  wholesaleFiltersToSearchParams,
} from '@/lib/wholesaleFilters';
import type { PublicOgrProduct } from '@/lib/publicCatalog';
import {
  formatMerchandiseSubtotalUsd,
  formatSuggestedRetailCad,
  formatWholesaleUsd,
} from '@/lib/wholesalePricing';
import { OGR_WHOLESALE_PATH } from '@/data/landing';
import {
  meetsMoq,
  orderTotals,
  upsertOrderLine,
  emptyWholesaleOrderDraft,
} from '@/lib/wholesaleOrderDraft';

function sample(overrides: Partial<PublicOgrProduct> = {}): PublicOgrProduct {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    sku: 'OG2513',
    publicSlug: 'american-revival-og2513',
    name: 'American Revival',
    cat: 'Short Sleeve Tees',
    color: 'Graphite',
    tagline: 'Great American Revival',
    description: '',
    page: 4,
    catalogYear: 2026,
    collection: '',
    wholesaleUsd: 13,
    msrpCad: 39.99,
    isNew: true,
    featured: false,
    publicSortOrder: 2,
    primaryImageUrl: null,
    alternateImageUrls: [],
    unitOfMeasure: 'each',
    minimumQuantity: null,
    orderMultiple: null,
    packQuantity: null,
    lifestyleThemes: ['fishing'],
    liveSku: null,
    availableSizes: ['M-XL'],
    ...overrides,
  };
}

describe('OGR_WHOLESALE_PATH', () => {
  it('points at the on-site wholesale collection', () => {
    expect(OGR_WHOLESALE_PATH).toBe('/old-guys-rule-wholesale');
  });
});

describe('wholesale pricing labels', () => {
  it('formats USD wholesale and CAD retail labels', () => {
    expect(formatWholesaleUsd(13)).toBe('US$13.00 wholesale');
    expect(formatWholesaleUsd(null)).toBeNull();
    expect(formatSuggestedRetailCad(39.99)).toBe('Suggested retail C$39.99');
    expect(formatSuggestedRetailCad(0)).toBeNull();
    expect(formatMerchandiseSubtotalUsd(100.5)).toBe('US$100.50');
  });
});

describe('wholesale filters URL round-trip', () => {
  it('parses and serializes query params', () => {
    const params = new URLSearchParams('q=revival&cat=Tees&theme=fishing&sort=name');
    const filters = parseWholesaleFilters(params);
    expect(filters).toEqual({
      q: 'revival',
      cat: 'Tees',
      theme: 'fishing',
      sort: 'name',
    });
    expect(wholesaleFiltersToSearchParams(filters).toString()).toBe(
      'q=revival&cat=Tees&theme=fishing&sort=name',
    );
  });

  it('omits default sort from URL and clear-all resets', () => {
    const params = wholesaleFiltersToSearchParams(DEFAULT_WHOLESALE_FILTERS);
    expect(params.toString()).toBe('');
    const cleared = parseWholesaleFilters(new URLSearchParams());
    expect(cleared).toEqual(DEFAULT_WHOLESALE_FILTERS);
  });

  it('filters and sorts the catalog', () => {
    const products = [
      sample({ id: 'a', name: 'Zulu', sku: 'Z1', publicSortOrder: 1, wholesaleUsd: 20 }),
      sample({
        id: 'b',
        name: 'Alpha',
        sku: 'A1',
        publicSortOrder: 2,
        wholesaleUsd: 10,
        lifestyleThemes: ['golf'],
        cat: 'Hats',
      }),
    ];
    expect(
      filterPublicOgrProducts(products, { ...DEFAULT_WHOLESALE_FILTERS, q: 'alpha' }),
    ).toHaveLength(1);
    expect(
      filterPublicOgrProducts(products, { ...DEFAULT_WHOLESALE_FILTERS, theme: 'golf' })[0]?.sku,
    ).toBe('A1');
    expect(
      filterPublicOgrProducts(products, { ...DEFAULT_WHOLESALE_FILTERS, sort: 'wholesale' })[0]
        ?.wholesaleUsd,
    ).toBe(10);
  });
});

describe('wholesale order draft helpers', () => {
  it('aggregates totals and MOQ checks', () => {
    let draft = emptyWholesaleOrderDraft();
    draft = upsertOrderLine(draft, {
      productId: '11111111-1111-1111-1111-111111111111',
      sku: 'OG1',
      name: 'Tee',
      size: 'L',
      wholesaleUsd: 10,
      quantity: 6,
      primaryImageUrl: null,
    });
    draft = upsertOrderLine(draft, {
      productId: '22222222-2222-2222-2222-222222222222',
      sku: 'OG2',
      name: 'Hat',
      size: 'OS',
      wholesaleUsd: 12,
      quantity: 18,
      primaryImageUrl: null,
    });
    expect(orderTotals(draft)).toEqual({
      totalUnits: 24,
      merchandiseSubtotalUsd: 6 * 10 + 18 * 12,
      styleCount: 2,
    });
    expect(meetsMoq(draft, 24, 6).ok).toBe(true);
    expect(meetsMoq(draft, 30, 6).ok).toBe(false);
  });

  it('fails per-style MOQ when a style is under the minimum', () => {
    let draft = emptyWholesaleOrderDraft();
    draft = upsertOrderLine(draft, {
      productId: '11111111-1111-1111-1111-111111111111',
      sku: 'OG1',
      name: 'Tee',
      size: 'L',
      wholesaleUsd: 10,
      quantity: 3,
      primaryImageUrl: null,
    });
    draft = upsertOrderLine(draft, {
      productId: '22222222-2222-2222-2222-222222222222',
      sku: 'OG2',
      name: 'Hat',
      size: 'OS',
      wholesaleUsd: 12,
      quantity: 21,
      primaryImageUrl: null,
    });
    const moq = meetsMoq(draft, 24, 6);
    expect(moq.totalOk).toBe(true);
    expect(moq.stylesOk).toBe(false);
    expect(moq.ok).toBe(false);
  });
});
