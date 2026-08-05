import { describe, expect, it } from 'vitest';
import { mapCatalogRow } from '@/lib/catalog';
import type { CatalogItemRow } from '@/types/database';

function publishingRow(overrides: Partial<CatalogItemRow> = {}): CatalogItemRow {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    line_id: '22222222-2222-2222-2222-222222222222',
    page: 1,
    cat: 'Short Sleeve Tees',
    sku: 'OG2513',
    name: 'American Revival',
    color: 'Graphite',
    tagline: 'Great American Revival',
    price_usd: 13,
    msrp_cad: 39.99,
    catalog_price_usd: 13,
    price_usd_override: null,
    catalog_msrp_cad: 39.99,
    msrp_cad_override: null,
    landed_cad_override: null,
    field_meta: {},
    status: 'active',
    is_new: true,
    is_name_drop: false,
    is_bestseller: false,
    pdf_page: null,
    catalog_year: 2026,
    brand: 'Old Guys Rule',
    product_family: null,
    collection: null,
    product_type: null,
    accent_color: null,
    sales_description: null,
    material: null,
    special_notes: null,
    sales_priority: null,
    sales_notes: null,
    primary_image_path: null,
    department: 'Apparel',
    normalized_sku: 'OG2513',
    unit_of_measure: 'each',
    minimum_quantity: null,
    order_multiple: null,
    pack_quantity: null,
    made_in_usa_claim: null,
    country_of_blank_manufacture: null,
    country_of_decoration: null,
    country_of_origin: null,
    primary_image_url: 'https://example.com/primary.jpg',
    source_image_url: null,
    catalog_verified: false,
    verification_notes: null,
    lifestyle_themes: [],
    recommended_channels: [],
    seasonality: null,
    sample_status: null,
    buyer_feedback: null,
    is_publicly_published: true,
    featured: true,
    public_sort_order: 12,
    public_slug: 'american-revival-og2513',
    live_sku: 'OG2010-SPF',
    live_sku_note: 'Live store alias',
    alternate_image_urls: ['https://example.com/alt.jpg'],
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('mapCatalogRow publishing fields', () => {
  it('maps public wholesale publishing columns', () => {
    const item = mapCatalogRow(publishingRow());
    expect(item.isPubliclyPublished).toBe(true);
    expect(item.featured).toBe(true);
    expect(item.publicSortOrder).toBe(12);
    expect(item.publicSlug).toBe('american-revival-og2513');
    expect(item.liveSku).toBe('OG2010-SPF');
    expect(item.liveSkuNote).toBe('Live store alias');
    expect(item.alternateImageUrls).toEqual(['https://example.com/alt.jpg']);
  });

  it('defaults unpublished / empty alts when unset', () => {
    const item = mapCatalogRow(
      publishingRow({
        is_publicly_published: false,
        featured: false,
        public_slug: null,
        live_sku: null,
        live_sku_note: null,
        alternate_image_urls: null as unknown as string[],
      }),
    );
    expect(item.isPubliclyPublished).toBe(false);
    expect(item.featured).toBe(false);
    expect(item.publicSlug).toBeNull();
    expect(item.liveSku).toBeNull();
    expect(item.alternateImageUrls).toEqual([]);
  });
});
