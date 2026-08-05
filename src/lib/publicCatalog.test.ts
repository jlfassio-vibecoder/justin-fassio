import { describe, expect, it } from 'vitest';
import {
  mapPublicOgrProductRow,
  PUBLIC_CATALOG_FORBIDDEN_KEYS,
  type PublicOgrProduct,
} from '@/lib/publicCatalog';

describe('mapPublicOgrProductRow', () => {
  it('maps approved public fields and strips staff-only concerns from the shape', () => {
    const product = mapPublicOgrProductRow({
      id: '11111111-1111-1111-1111-111111111111',
      sku: 'OG2513',
      public_slug: 'american-revival-og2513',
      name: 'American Revival',
      cat: 'Short Sleeve Tees',
      color: 'Graphite Heather',
      tagline: 'Great American Revival',
      description: 'Public description',
      page: 4,
      catalog_year: 2026,
      collection: null,
      wholesale_usd: 13,
      msrp_cad: 39.99,
      is_new: true,
      featured: false,
      public_sort_order: 0,
      primary_image_url: 'https://oldguysrule.com/cdn/shop/files/GAV1_2000x.jpg',
      alternate_image_urls: ['https://oldguysrule.com/cdn/shop/files/GAV5_2000x.jpg'],
      unit_of_measure: 'each',
      minimum_quantity: null,
      order_multiple: null,
      pack_quantity: null,
      lifestyle_themes: ['fishing', 'retirement'],
      live_sku: null,
      available_sizes: ['M-XL', '2X'],
    });

    expect(product.publicSlug).toBe('american-revival-og2513');
    expect(product.wholesaleUsd).toBe(13);
    expect(product.alternateImageUrls).toHaveLength(1);
    expect(product.lifestyleThemes).toEqual(['fishing', 'retirement']);
    expect(product.availableSizes).toEqual(['M-XL', '2X']);

    const keys = Object.keys(product) as (keyof PublicOgrProduct)[];
    for (const forbidden of PUBLIC_CATALOG_FORBIDDEN_KEYS) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
