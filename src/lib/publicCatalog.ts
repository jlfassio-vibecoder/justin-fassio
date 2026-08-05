import { supabase } from '@/lib/supabase';

/** Public OGR wholesale product projection (RPC surface only — no staff fields). */
export type PublicOgrProduct = {
  id: string;
  sku: string;
  publicSlug: string;
  name: string;
  cat: string;
  color: string;
  tagline: string;
  description: string;
  page: number | null;
  catalogYear: number | null;
  collection: string;
  wholesaleUsd: number;
  msrpCad: number;
  isNew: boolean;
  featured: boolean;
  publicSortOrder: number;
  primaryImageUrl: string | null;
  alternateImageUrls: string[];
  unitOfMeasure: string;
  minimumQuantity: number | null;
  orderMultiple: number | null;
  packQuantity: number | null;
  lifestyleThemes: string[];
  liveSku: string | null;
  availableSizes: string[];
};

export type PublicOgrSupplierTerms = {
  minOrderPieces: number;
  minPiecesPerDesign: number;
  defaultShippingMethod: string;
  pricesSubjectToChange: boolean;
};

/** Keys that must never appear on the public product type / mapper output. */
export const PUBLIC_CATALOG_FORBIDDEN_KEYS = [
  'salesNotes',
  'salesPriority',
  'buyerFeedback',
  'fieldMeta',
  'priceUsdOverride',
  'msrpCadOverride',
  'landedCadOverride',
  'verificationNotes',
  'specialNotes',
  'primaryImagePath',
  'sales_notes',
  'field_meta',
  'landed_cad_override',
] as const;

type PublicOgrProductRow = {
  id: string;
  sku: string;
  public_slug: string;
  name: string;
  cat: string;
  color: string | null;
  tagline: string | null;
  description: string | null;
  page: number | null;
  catalog_year: number | null;
  collection: string | null;
  wholesale_usd: number;
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
  available_sizes: string[] | null;
};

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

export function mapPublicOgrProductRow(row: PublicOgrProductRow): PublicOgrProduct {
  return {
    id: row.id,
    sku: row.sku,
    publicSlug: row.public_slug,
    name: row.name,
    cat: row.cat,
    color: row.color ?? '',
    tagline: row.tagline ?? '',
    description: row.description ?? '',
    page: row.page,
    catalogYear: row.catalog_year,
    collection: row.collection ?? '',
    wholesaleUsd: Number(row.wholesale_usd),
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
    availableSizes: row.available_sizes ?? [],
  };
}

export async function fetchPublicOgrProducts(): Promise<{
  data: PublicOgrProduct[];
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('get_public_ogr_products');
  if (error) return { data: [], error: error.message };
  const rows = (data ?? []) as PublicOgrProductRow[];
  return { data: rows.map(mapPublicOgrProductRow), error: null };
}

export async function fetchPublicOgrProductBySlug(slug: string): Promise<{
  data: PublicOgrProduct | null;
  error: string | null;
}> {
  const trimmed = slug.trim();
  if (!trimmed) return { data: null, error: 'Slug is required' };

  const { data, error } = await supabase.rpc('get_public_ogr_product_by_slug', {
    p_slug: trimmed,
  });
  if (error) return { data: null, error: error.message };
  const rows = (data ?? []) as PublicOgrProductRow[];
  const row = rows[0];
  if (!row) return { data: null, error: null };
  return { data: mapPublicOgrProductRow(row), error: null };
}

export async function fetchPublicOgrSupplierTerms(): Promise<{
  data: PublicOgrSupplierTerms | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('get_public_ogr_supplier_terms');
  if (error) return { data: null, error: error.message };
  const row = (data ?? [])[0] as
    | {
        min_order_pieces: number;
        min_pieces_per_design: number;
        default_shipping_method: string | null;
        prices_subject_to_change: boolean;
      }
    | undefined;
  if (!row) return { data: null, error: null };
  return {
    data: {
      minOrderPieces: row.min_order_pieces,
      minPiecesPerDesign: row.min_pieces_per_design,
      defaultShippingMethod: row.default_shipping_method ?? '',
      pricesSubjectToChange: row.prices_subject_to_change,
    },
    error: null,
  };
}
