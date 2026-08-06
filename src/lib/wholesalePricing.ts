export function formatWholesaleUsd(amount: number | null | undefined): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  return `US$${amount.toFixed(2)} wholesale`;
}

export function formatCadAmount(amount: number): string {
  return `C$${amount.toFixed(2)}`;
}

/**
 * Upper band above catalog MSRP for public “typical retail” ranges.
 * Reflects CAD ticket movement when USD wholesale / FX shifts.
 */
export const TYPICAL_RETAIL_FX_BAND_RATE = 0.125;

export function typicalRetailCadRange(msrpCad: number): { low: number; high: number } | null {
  if (!(msrpCad > 0) || !Number.isFinite(msrpCad)) return null;
  const high = Math.round(msrpCad * (1 + TYPICAL_RETAIL_FX_BAND_RATE) * 100) / 100;
  return { low: msrpCad, high };
}

/** Public catalog retail label — MSRP through FX-buffered high. */
export function formatSuggestedRetailCad(msrpCad: number): string | null {
  const range = typicalRetailCadRange(msrpCad);
  if (!range) return null;
  if (range.high <= range.low) {
    return `Typical Canadian retail: ${formatCadAmount(range.low)}`;
  }
  return `Typical Canadian retail: ${formatCadAmount(range.low)}–${formatCadAmount(range.high)}`;
}

export const RETAIL_PRICE_DISCLAIMER = 'Retailers independently set resale prices.';

export const WHOLESALE_LOCKED_LABEL = 'Wholesale pricing available after retailer verification';

export function formatMerchandiseSubtotalUsd(amount: number): string {
  return `US$${amount.toFixed(2)}`;
}

export function hasWholesalePricing(wholesaleUsd: number | null | undefined): boolean {
  return wholesaleUsd != null && Number.isFinite(wholesaleUsd);
}
