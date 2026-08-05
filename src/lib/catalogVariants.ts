import type { CatalogVariantRow } from '@/types/database';
import { resolveEffectiveNumber } from '@/lib/catalogProvenance';

export type CatalogVariant = {
  id: string;
  catalogItemId: string;
  size: string;
  color: string;
  style: string;
  wholesaleUsd: number;
  catalogWholesaleUsd: number;
  wholesaleUsdOverride: number | null;
  unitOfMeasure: string;
  packQuantity: number | null;
  packPriceUsd: number | null;
  availability: string;
  sortOrder: number;
  notes: string;
};

export function mapCatalogVariantRow(row: CatalogVariantRow): CatalogVariant {
  const catalogWholesaleUsd = Number(row.wholesale_usd);
  const override = row.wholesale_usd_override == null ? null : Number(row.wholesale_usd_override);
  return {
    id: row.id,
    catalogItemId: row.catalog_item_id,
    size: row.size ?? '',
    color: row.color ?? '',
    style: row.style ?? '',
    wholesaleUsd: resolveEffectiveNumber({
      override,
      catalog: catalogWholesaleUsd,
    }),
    catalogWholesaleUsd,
    wholesaleUsdOverride: override,
    unitOfMeasure: row.unit_of_measure,
    packQuantity: row.pack_quantity,
    packPriceUsd: row.pack_price_usd == null ? null : Number(row.pack_price_usd),
    availability: row.availability,
    sortOrder: row.sort_order,
    notes: row.notes ?? '',
  };
}

/** Prefer first non-BASE size band, else BASE, else first by sort. */
export function pickDisplayVariant(variants: CatalogVariant[]): CatalogVariant | null {
  if (!variants.length) return null;
  const sorted = [...variants].sort((a, b) => a.sortOrder - b.sortOrder);
  const nonBase = sorted.find((v) => v.size && v.size !== 'BASE');
  return nonBase ?? sorted[0] ?? null;
}

export function baseWholesaleUsd(variants: CatalogVariant[], fallbackPriceUsd: number): number {
  const base = variants.find((v) => v.size === 'BASE' || v.size === 'M-XL' || v.size === 'M–XL');
  if (base) return base.wholesaleUsd;
  const first = pickDisplayVariant(variants);
  return first?.wholesaleUsd ?? fallbackPriceUsd;
}
