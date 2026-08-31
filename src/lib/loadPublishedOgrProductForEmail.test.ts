import { describe, expect, it, vi } from 'vitest';
import type { AgentSupabase } from '@/lib/agentAuth';
import {
  loadPublishedOgrProductForEmail,
  mapEmailOgrProductRow,
  type EmailOgrProductRow,
} from '@/lib/loadPublishedOgrProductForEmail';
import { PUBLIC_CATALOG_FORBIDDEN_KEYS } from '@/lib/publicCatalog';

const publishedRow: EmailOgrProductRow = {
  id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  sku: 'OG2513',
  public_slug: 'american-revival',
  name: 'American Revival',
  cat: 'Tees',
  color: 'Navy',
  tagline: 'Classic fit',
  sales_description: 'A strong opener.',
  page: 12,
  catalog_year: 2025,
  collection: 'Core',
  msrp_cad: 48,
  price_usd: 13,
  catalog_price_usd: 13,
  price_usd_override: null,
  is_new: true,
  featured: false,
  public_sort_order: 10,
  primary_image_url: 'https://cdn.example.com/og2513.jpg',
  alternate_image_urls: ['https://cdn.example.com/og2513-b.jpg'],
  unit_of_measure: 'each',
  minimum_quantity: 6,
  order_multiple: 6,
  pack_quantity: null,
  lifestyle_themes: ['classic'],
  live_sku: null,
  status: 'active',
  is_publicly_published: true,
  line_id: 'line-ogr',
};

describe('mapEmailOgrProductRow', () => {
  it('maps sales_description to description and nulls wholesale', () => {
    const product = mapEmailOgrProductRow(publishedRow, ['M', 'L']);
    expect(product.description).toBe('A strong opener.');
    expect(product.wholesaleUsd).toBeNull();
    expect(product.publicSlug).toBe('american-revival');
    expect(product.availableSizes).toEqual(['M', 'L']);
    for (const key of PUBLIC_CATALOG_FORBIDDEN_KEYS) {
      expect(product).not.toHaveProperty(key);
    }
  });
});

describe('loadPublishedOgrProductForEmail', () => {
  it('returns published OGR product with sizes', async () => {
    const lineMaybeSingle = vi.fn().mockResolvedValue({ data: { id: 'line-ogr' }, error: null });
    const itemMaybeSingle = vi.fn().mockResolvedValue({ data: publishedRow, error: null });
    const variantOrder = vi.fn().mockResolvedValue({
      data: [
        { size: 'M', sort_order: 1 },
        { size: 'L', sort_order: 2 },
      ],
      error: null,
    });

    const from = vi.fn((table: string) => {
      if (table === 'lines') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: lineMaybeSingle }),
          }),
        };
      }
      if (table === 'catalog_items') {
        const eq2 = vi.fn().mockReturnValue({ maybeSingle: itemMaybeSingle });
        const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
        return { select: vi.fn().mockReturnValue({ eq: eq1 }) };
      }
      if (table === 'catalog_variants') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ order: variantOrder }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await loadPublishedOgrProductForEmail(
      { from } as unknown as AgentSupabase,
      publishedRow.id,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.product.sku).toBe('OG2513');
    expect(result.product.wholesaleUsd).toBeNull();
    expect(result.wholesaleUsd).toBe(13);
    expect(result.product.availableSizes).toEqual(['M', 'L']);
  });

  it('returns not_found when item is missing', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'lines') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'line-ogr' }, error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      };
    });

    const result = await loadPublishedOgrProductForEmail(
      { from } as unknown as AgentSupabase,
      publishedRow.id,
    );
    expect(result).toEqual({
      ok: false,
      reason: 'not_found',
      message: 'Product not found',
    });
  });

  it('returns not_available when unpublished', async () => {
    const unpublished = { ...publishedRow, is_publicly_published: false };
    const from = vi.fn((table: string) => {
      if (table === 'lines') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'line-ogr' }, error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: unpublished, error: null }),
            }),
          }),
        }),
      };
    });

    const result = await loadPublishedOgrProductForEmail(
      { from } as unknown as AgentSupabase,
      publishedRow.id,
    );
    expect(result).toEqual({
      ok: false,
      reason: 'not_available',
      message: 'Product is not publicly available',
    });
  });

  it('returns not_available when inactive', async () => {
    const inactive = { ...publishedRow, status: 'archived' };
    const from = vi.fn((table: string) => {
      if (table === 'lines') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'line-ogr' }, error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: inactive, error: null }),
            }),
          }),
        }),
      };
    });

    const result = await loadPublishedOgrProductForEmail(
      { from } as unknown as AgentSupabase,
      publishedRow.id,
    );
    expect(result).toEqual({
      ok: false,
      reason: 'not_available',
      message: 'Product is not publicly available',
    });
  });

  it('returns not_available when public_slug is blank', async () => {
    const noSlug = { ...publishedRow, public_slug: '   ' };
    const from = vi.fn((table: string) => {
      if (table === 'lines') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'line-ogr' }, error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: noSlug, error: null }),
            }),
          }),
        }),
      };
    });

    const result = await loadPublishedOgrProductForEmail(
      { from } as unknown as AgentSupabase,
      publishedRow.id,
    );
    expect(result).toEqual({
      ok: false,
      reason: 'not_available',
      message: 'Product is not publicly available',
    });
  });

  it('returns not_found when OGR line is missing (non-OGR path)', async () => {
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });

    const result = await loadPublishedOgrProductForEmail(
      { from } as unknown as AgentSupabase,
      publishedRow.id,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('not_found');
  });
});
