import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '@/lib/catalog';
import { filterCatalogItems } from '@/lib/catalogFilters';

const SAMPLE: CatalogItem[] = [
  {
    page: 4,
    cat: 'Short Sleeve Tees',
    sku: 'OG2511',
    name: 'AMERICAN DREAM',
    color: 'Stone Blue',
    tagline: 'Living The American Dream',
    priceUsd: 13,
    msrpCad: 39.99,
    isNew: true,
    isNameDrop: false,
  },
  {
    page: 5,
    cat: 'Headwear',
    sku: 'OG9001',
    name: 'CLASSIC CAP',
    color: 'Black',
    tagline: 'Everyday Cap',
    priceUsd: 10,
    msrpCad: 29.99,
    isNew: false,
    isNameDrop: true,
  },
  {
    page: 6,
    cat: 'Short Sleeve Tees',
    sku: 'OG1000',
    name: 'VINTAGE WAVE',
    color: 'White',
    tagline: 'Catch the Wave',
    priceUsd: 13,
    msrpCad: 39.99,
    isNew: false,
    isNameDrop: false,
  },
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
