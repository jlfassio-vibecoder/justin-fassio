import { supabase } from '@/lib/supabase';
import type { CatalogItemRow } from '@/types/database';

export interface CatalogItem {
  page: number;
  cat: string;
  sku: string;
  name: string;
  color: string;
  tagline: string;
  priceUsd: number;
  msrpCad: number;
  isNew: boolean;
  isNameDrop: boolean;
}

export function mapCatalogRow(row: CatalogItemRow): CatalogItem {
  return {
    page: row.page ?? 0,
    cat: row.cat,
    sku: row.sku,
    name: row.name,
    color: row.color ?? '',
    tagline: row.tagline ?? '',
    priceUsd: Number(row.price_usd),
    msrpCad: Number(row.msrp_cad),
    isNew: row.is_new,
    isNameDrop: row.is_name_drop,
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
    .select(
      'id, line_id, page, cat, sku, name, color, tagline, price_usd, msrp_cad, is_new, is_name_drop, created_at, updated_at',
    )
    .eq('line_id', line.id)
    .order('page', { ascending: true })
    .order('sku', { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []).map(mapCatalogRow), error: null };
}
