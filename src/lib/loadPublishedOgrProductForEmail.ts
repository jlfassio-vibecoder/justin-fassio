import type { AgentSupabase } from '@/lib/agentAuth';
import { CATALOG_VARIANT_SELECT } from '@/lib/catalog';
import type { PublicOgrProduct } from '@/lib/publicCatalog';
import type { CatalogVariantRow } from '@/types/database';

/** Lean catalog columns needed to build a public product projection for email. */
export const EMAIL_OGR_PRODUCT_SELECT =
  'id, sku, public_slug, name, cat, color, tagline, sales_description, page, catalog_year, collection, msrp_cad, is_new, featured, public_sort_order, primary_image_url, alternate_image_urls, unit_of_measure, minimum_quantity, order_multiple, pack_quantity, lifestyle_themes, live_sku, status, is_publicly_published, line_id';

export type EmailOgrProductRow = {
  id: string;
  sku: string;
  public_slug: string | null;
  name: string;
  cat: string;
  color: string | null;
  tagline: string | null;
  sales_description: string | null;
  page: number | null;
  catalog_year: number | null;
  collection: string | null;
  msrp_cad: number;
  is_new: boolean;
  featured: boolean;
  public_sort_order: number;
  primary_image_url: string | null;
  alternate_image_urls: unknown;
  unit_of_measure: string;
  minimum_quantity: number | null;
  order_multiple: number | null;
  pack_quantity: number | null;
  lifestyle_themes: unknown;
  live_sku: string | null;
  status: string;
  is_publicly_published: boolean;
  line_id: string;
};

export type LoadPublishedOgrProductForEmailResult =
  | { ok: true; product: PublicOgrProduct }
  | { ok: false; reason: 'not_found' | 'not_available'; message: string };

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

/** Map a staff catalog row + sizes into the public product shape (wholesale always null). */
export function mapEmailOgrProductRow(
  row: EmailOgrProductRow,
  availableSizes: string[] = [],
): PublicOgrProduct {
  return {
    id: row.id,
    sku: row.sku,
    publicSlug: (row.public_slug ?? '').trim(),
    name: row.name,
    cat: row.cat,
    color: row.color ?? '',
    tagline: row.tagline ?? '',
    description: row.sales_description ?? '',
    page: row.page,
    catalogYear: row.catalog_year,
    collection: row.collection ?? '',
    wholesaleUsd: null,
    msrpCad: Number(row.msrp_cad),
    isNew: row.is_new,
    featured: row.featured,
    publicSortOrder: row.public_sort_order,
    primaryImageUrl: row.primary_image_url,
    alternateImageUrls: asStringArray(row.alternate_image_urls),
    unitOfMeasure: row.unit_of_measure,
    minimumQuantity: row.minimum_quantity,
    orderMultiple: row.order_multiple,
    packQuantity: row.pack_quantity,
    lifestyleThemes: asStringArray(row.lifestyle_themes),
    liveSku: row.live_sku,
    availableSizes,
  };
}

function isPubliclyAvailable(row: EmailOgrProductRow): boolean {
  return (
    row.status === 'active' &&
    row.is_publicly_published === true &&
    Boolean(row.public_slug?.trim())
  );
}

/**
 * Authoritative staff-side load of a published product for outreach email.
 * Defaults to the OGR line when salesLineId is omitted.
 * Rejects missing, unpublished, inactive, or slug-less items.
 */
export async function loadPublishedOgrProductForEmail(
  supabase: AgentSupabase,
  productId: string,
  options?: { salesLineId?: string },
): Promise<LoadPublishedOgrProductForEmailResult> {
  const id = productId.trim();
  if (!id) {
    return { ok: false, reason: 'not_found', message: 'Product not found' };
  }

  let lineId = options?.salesLineId?.trim() || '';
  if (!lineId) {
    const { data: line, error: lineError } = await supabase
      .from('lines')
      .select('id')
      .eq('code', 'ogr')
      .maybeSingle();

    if (lineError || !line) {
      return { ok: false, reason: 'not_found', message: 'Product not found' };
    }
    lineId = line.id;
  }

  const { data, error } = await supabase
    .from('catalog_items')
    .select(EMAIL_OGR_PRODUCT_SELECT)
    .eq('id', id)
    .eq('line_id', lineId)
    .maybeSingle();

  if (error) {
    console.error('[ogrProductOutreachEmail]', {
      workflow: 'load_product',
      productId: id,
      error: error.message,
    });
    return { ok: false, reason: 'not_found', message: 'Product not found' };
  }
  if (!data) {
    return { ok: false, reason: 'not_found', message: 'Product not found' };
  }

  const row = data as EmailOgrProductRow;
  if (!isPubliclyAvailable(row)) {
    return {
      ok: false,
      reason: 'not_available',
      message: 'Product is not publicly available',
    };
  }

  const { data: variantRows } = await supabase
    .from('catalog_variants')
    .select(CATALOG_VARIANT_SELECT)
    .eq('catalog_item_id', id)
    .order('sort_order', { ascending: true });

  const availableSizes = (variantRows ?? [])
    .map((v) => (v as CatalogVariantRow).size?.trim() ?? '')
    .filter(Boolean);

  return { ok: true, product: mapEmailOgrProductRow(row, availableSizes) };
}
