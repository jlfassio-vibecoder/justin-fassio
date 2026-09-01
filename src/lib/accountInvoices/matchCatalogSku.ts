/** Map invoice base SKUs to published OGR catalog_items. */

import { normalizeSku, skusMatch } from '@/lib/skuNormalize';

export type CatalogSkuRow = {
  id: string;
  sku: string;
  normalized_sku: string | null;
  live_sku: string | null;
};

export function buildCatalogSkuIndex(rows: CatalogSkuRow[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of rows) {
    const keys = [row.sku, row.normalized_sku, row.live_sku].filter(
      (v): v is string => typeof v === 'string' && v.trim().length > 0,
    );
    for (const key of keys) {
      out.set(normalizeSku(key), row.id);
    }
  }
  return out;
}

export function matchCatalogItemIdForInvoiceSku(
  skuBase: string,
  index: Map<string, string>,
): string | null {
  const normalized = normalizeSku(skuBase);
  if (index.has(normalized)) return index.get(normalized) ?? null;

  for (const [catalogSku, id] of index.entries()) {
    if (skusMatch(normalized, catalogSku)) return id;
  }
  return null;
}
