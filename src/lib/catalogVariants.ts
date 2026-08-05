import type { CatalogVariantRow } from '@/types/database';
import { resolveEffectiveNumber } from '@/lib/catalogProvenance';
import { unitEquivalentWholesaleUsd } from '@/lib/catalogUnitPrice';

export type CatalogVariant = {
  id: string;
  catalogItemId: string;
  size: string;
  sizeGroup: string;
  color: string;
  style: string;
  variantSku: string;
  wholesaleUsd: number;
  catalogWholesaleUsd: number;
  wholesaleUsdOverride: number | null;
  unitOfMeasure: string;
  packQuantity: number | null;
  packPriceUsd: number | null;
  unitEquivalentWholesaleUsd: number;
  availability: string;
  sortOrder: number;
  notes: string;
};

export function mapCatalogVariantRow(row: CatalogVariantRow): CatalogVariant {
  const catalogWholesaleUsd = Number(row.wholesale_usd);
  const override = row.wholesale_usd_override == null ? null : Number(row.wholesale_usd_override);
  const wholesaleUsd = resolveEffectiveNumber({
    override,
    catalog: catalogWholesaleUsd,
  });
  const packQuantity = row.pack_quantity;
  const packPriceUsd = row.pack_price_usd == null ? null : Number(row.pack_price_usd);
  return {
    id: row.id,
    catalogItemId: row.catalog_item_id,
    size: row.size ?? '',
    sizeGroup: row.size_group ?? '',
    color: row.color ?? '',
    style: row.style ?? '',
    variantSku: row.variant_sku ?? '',
    wholesaleUsd,
    catalogWholesaleUsd,
    wholesaleUsdOverride: override,
    unitOfMeasure: row.unit_of_measure,
    packQuantity,
    packPriceUsd,
    unitEquivalentWholesaleUsd: unitEquivalentWholesaleUsd({
      wholesaleUsd,
      packQuantity,
      packPriceUsd,
    }),
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
  const base = variants.find(
    (v) =>
      v.size === 'BASE' ||
      v.size === 'M-XL' ||
      v.size === 'M–XL' ||
      v.sizeGroup === 'M-XL' ||
      v.sizeGroup === 'M–XL',
  );
  if (base) return base.wholesaleUsd;
  const first = pickDisplayVariant(variants);
  return first?.wholesaleUsd ?? fallbackPriceUsd;
}
