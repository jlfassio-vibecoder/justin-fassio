import { describe, expect, it } from 'vitest';
import { catalogItemStub } from '@/lib/catalog';
import { CATALOG_CATEGORY_FILTER_OPTIONS, filterCatalogItems } from '@/lib/catalogFilters';

const SAMPLE = [
  catalogItemStub({
    page: 4,
    cat: 'Short Sleeve Tees',
    sku: 'OG2511',
    name: 'AMERICAN DREAM',
    color: 'Stone Blue',
    tagline: 'Living The American Dream',
    priceUsd: 13,
    msrpCad: 39.99,
    isNew: true,
  }),
  catalogItemStub({
    page: 5,
    cat: 'Headwear',
    sku: 'OG9001',
    name: 'CLASSIC CAP',
    color: 'Black',
    tagline: 'Everyday Cap',
    priceUsd: 10,
    msrpCad: 29.99,
    isNameDrop: true,
  }),
  catalogItemStub({
    page: 6,
    cat: 'Short Sleeve Tees',
    sku: 'OG1000',
    name: 'VINTAGE WAVE',
    color: 'White',
    tagline: 'Catch the Wave',
    priceUsd: 13,
    msrpCad: 39.99,
  }),
];

describe('filterCatalogItems', () => {
  it('returns all items when filters are open', () => {
    expect(filterCatalogItems(SAMPLE, { search: '', category: 'ALL', flag: 'ALL' })).toHaveLength(
      3,
    );
  });

  it('matches search across sku, name, tagline, and color', () => {
    expect(
      filterCatalogItems(SAMPLE, { search: 'wave', category: 'ALL', flag: 'ALL' }).map(
        (i) => i.sku,
      ),
    ).toEqual(['OG1000']);
    expect(
      filterCatalogItems(SAMPLE, { search: 'stone', category: 'ALL', flag: 'ALL' }).map(
        (i) => i.sku,
      ),
    ).toEqual(['OG2511']);
  });

  it('applies category and flag together (AND)', () => {
    expect(
      filterCatalogItems(SAMPLE, {
        search: '',
        category: 'Short Sleeve Tees',
        flag: 'NEW',
      }).map((i) => i.sku),
    ).toEqual(['OG2511']);

    expect(
      filterCatalogItems(SAMPLE, {
        search: '',
        category: 'Headwear',
        flag: 'NAMEDROP',
      }).map((i) => i.sku),
    ).toEqual(['OG9001']);
  });
});

describe('CATALOG_CATEGORY_FILTER_OPTIONS', () => {
  it('starts with All Categories for Line Sheet and account picker', () => {
    expect(CATALOG_CATEGORY_FILTER_OPTIONS[0]).toEqual({ value: 'ALL', label: 'All Categories' });
    expect(CATALOG_CATEGORY_FILTER_OPTIONS.some((opt) => opt.value === 'Headwear')).toBe(true);
  });
});
