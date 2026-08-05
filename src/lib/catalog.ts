import { supabase } from '@/lib/supabase';
import { resolveEffectiveNumber, type FieldMetaMap } from '@/lib/catalogProvenance';
import { baseWholesaleUsd, mapCatalogVariantRow, type CatalogVariant } from '@/lib/catalogVariants';
import type { CatalogItemRow, CatalogVariantRow } from '@/types/database';

export interface CatalogItem {
  id: string;
  page: number;
  cat: string;
  sku: string;
  name: string;
  color: string;
  tagline: string;
  /** Effective wholesale USD (override → catalog dual → legacy price_usd). */
  priceUsd: number;
  catalogPriceUsd: number;
  priceUsdOverride: number | null;
  msrpCad: number;
  catalogMsrpCad: number;
  msrpCadOverride: number | null;
  landedCadOverride: number | null;
  isNew: boolean;
  isNameDrop: boolean;
  isBestseller: boolean;
  status: string;
  fieldMeta: FieldMetaMap;
  pdfPage: number | null;
  catalogYear: number | null;
  brand: string;
  collection: string;
  productType: string;
  accentColor: string;
  salesDescription: string;
  material: string;
  specialNotes: string;
  salesPriority: string;
  salesNotes: string;
  primaryImagePath: string | null;
  variants: CatalogVariant[];
}

const CATALOG_SELECT =
  'id, line_id, page, cat, sku, name, color, tagline, price_usd, msrp_cad, catalog_price_usd, price_usd_override, catalog_msrp_cad, msrp_cad_override, landed_cad_override, field_meta, status, is_new, is_name_drop, is_bestseller, pdf_page, catalog_year, brand, product_family, collection, product_type, accent_color, sales_description, material, special_notes, sales_priority, sales_notes, primary_image_path, created_at, updated_at';

function asFieldMeta(raw: unknown): FieldMetaMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as FieldMetaMap;
}

export function mapCatalogRow(row: CatalogItemRow, variants: CatalogVariant[] = []): CatalogItem {
  const catalogPriceUsd = Number(row.catalog_price_usd ?? row.price_usd);
  const priceUsdOverride = row.price_usd_override == null ? null : Number(row.price_usd_override);
  const catalogMsrpCad = Number(row.catalog_msrp_cad ?? row.msrp_cad);
  const msrpCadOverride = row.msrp_cad_override == null ? null : Number(row.msrp_cad_override);
  const effectiveFromDual = resolveEffectiveNumber({
    override: priceUsdOverride,
    catalog: catalogPriceUsd,
    legacy: Number(row.price_usd),
  });
  const priceUsd =
    variants.length > 0 ? baseWholesaleUsd(variants, effectiveFromDual) : effectiveFromDual;

  return {
    id: row.id,
    page: row.page ?? 0,
    cat: row.cat,
    sku: row.sku,
    name: row.name,
    color: row.color ?? '',
    tagline: row.tagline ?? '',
    priceUsd,
    catalogPriceUsd,
    priceUsdOverride,
    msrpCad: resolveEffectiveNumber({
      override: msrpCadOverride,
      catalog: catalogMsrpCad,
      legacy: Number(row.msrp_cad),
    }),
    catalogMsrpCad,
    msrpCadOverride,
    landedCadOverride: row.landed_cad_override == null ? null : Number(row.landed_cad_override),
    isNew: row.is_new,
    isNameDrop: row.is_name_drop,
    isBestseller: row.is_bestseller ?? false,
    status: row.status ?? 'active',
    fieldMeta: asFieldMeta(row.field_meta),
    pdfPage: row.pdf_page,
    catalogYear: row.catalog_year,
    brand: row.brand ?? '',
    collection: row.collection ?? '',
    productType: row.product_type ?? '',
    accentColor: row.accent_color ?? '',
    salesDescription: row.sales_description ?? '',
    material: row.material ?? '',
    specialNotes: row.special_notes ?? '',
    salesPriority: row.sales_priority ?? '',
    salesNotes: row.sales_notes ?? '',
    primaryImagePath: row.primary_image_path,
    variants,
  };
}

/** Test / stub helper for CatalogItem required fields. */
export function catalogItemStub(
  partial: Partial<CatalogItem> & Pick<CatalogItem, 'sku' | 'name'>,
): CatalogItem {
  return {
    id: partial.id ?? `stub-${partial.sku}`,
    page: partial.page ?? 1,
    cat: partial.cat ?? 'Short Sleeve Tees',
    sku: partial.sku,
    name: partial.name,
    color: partial.color ?? '',
    tagline: partial.tagline ?? '',
    priceUsd: partial.priceUsd ?? 13,
    catalogPriceUsd: partial.catalogPriceUsd ?? partial.priceUsd ?? 13,
    priceUsdOverride: partial.priceUsdOverride ?? null,
    msrpCad: partial.msrpCad ?? 39.99,
    catalogMsrpCad: partial.catalogMsrpCad ?? partial.msrpCad ?? 39.99,
    msrpCadOverride: partial.msrpCadOverride ?? null,
    landedCadOverride: partial.landedCadOverride ?? null,
    isNew: partial.isNew ?? false,
    isNameDrop: partial.isNameDrop ?? false,
    isBestseller: partial.isBestseller ?? false,
    status: partial.status ?? 'active',
    fieldMeta: partial.fieldMeta ?? {},
    pdfPage: partial.pdfPage ?? null,
    catalogYear: partial.catalogYear ?? 2026,
    brand: partial.brand ?? 'Old Guys Rule',
    collection: partial.collection ?? '',
    productType: partial.productType ?? '',
    accentColor: partial.accentColor ?? '',
    salesDescription: partial.salesDescription ?? '',
    material: partial.material ?? '',
    specialNotes: partial.specialNotes ?? '',
    salesPriority: partial.salesPriority ?? '',
    salesNotes: partial.salesNotes ?? '',
    primaryImagePath: partial.primaryImagePath ?? null,
    variants: partial.variants ?? [],
  };
}

export async function fetchCatalogItems(): Promise<{
  data: CatalogItem[];
  error: string | null;
}> {
  const { data: line, error: lineError } = await supabase
    .from('lines')
    .select('id')
    .eq('code', 'ogr')
    .maybeSingle();

  if (lineError) {
    return { data: [], error: lineError.message };
  }
  if (!line) {
    return { data: [], error: 'Old Guys Rule line not found' };
  }

  const { data, error } = await supabase
    .from('catalog_items')
    .select(CATALOG_SELECT)
    .eq('line_id', line.id)
    .order('page', { ascending: true })
    .order('sku', { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  const rows = (data ?? []) as CatalogItemRow[];
  const ids = rows.map((r) => r.id);
  let variantsByItem = new Map<string, CatalogVariant[]>();

  if (ids.length) {
    const { data: variantRows, error: variantError } = await supabase
      .from('catalog_variants')
      .select(
        'id, catalog_item_id, size, color, style, wholesale_usd, wholesale_usd_override, unit_of_measure, pack_quantity, pack_price_usd, availability, sort_order, notes, created_at, updated_at',
      )
      .in('catalog_item_id', ids)
      .order('sort_order', { ascending: true });

    if (variantError) {
      return { data: [], error: variantError.message };
    }

    variantsByItem = new Map();
    for (const raw of variantRows ?? []) {
      const v = mapCatalogVariantRow(raw as CatalogVariantRow);
      const list = variantsByItem.get(v.catalogItemId) ?? [];
      list.push(v);
      variantsByItem.set(v.catalogItemId, list);
    }
  }

  return {
    data: rows.map((row) => mapCatalogRow(row, variantsByItem.get(row.id) ?? [])),
    error: null,
  };
}
