export interface PriceableItem {
  priceUsd: number;
  msrpCad: number;
}

/** CAD landed-cost stack factors (rates are fractions, e.g. 0.10 = 10%). */
export type LandedCostFactors = {
  fx: number;
  freightRate: number;
  gstRate: number;
  otherTaxRate: number;
};

export const DEFAULT_LANDED_COST_FACTORS: LandedCostFactors = {
  fx: 1.45,
  freightRate: 0.1,
  gstRate: 0.05,
  otherTaxRate: 0,
};

/** Format a rate as a whole-number percent label (0.10 → "10%"). */
export function formatRatePct(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

/**
 * Product cost before recoverable import GST (FX × freight × other).
 * Use this for retailer margin when GST is recoverable.
 */
export function landedCadBeforeRecoverableGst(
  priceUsd: number,
  factors: LandedCostFactors,
): number {
  return priceUsd * factors.fx * (1 + factors.freightRate) * (1 + factors.otherTaxRate);
}

/** Cash outlay including import GST. */
export function cashCostIncludingImportGst(priceUsd: number, factors: LandedCostFactors): number {
  return landedCadBeforeRecoverableGst(priceUsd, factors) * (1 + factors.gstRate);
}

/**
 * Full stack including GST (legacy table display).
 * Pass `{ includeGst: false }` to match landedCadBeforeRecoverableGst.
 */
export function landedCad(
  priceUsd: number,
  factors: LandedCostFactors,
  options?: { includeGst?: boolean },
): number {
  if (options?.includeGst === false) {
    return landedCadBeforeRecoverableGst(priceUsd, factors);
  }
  return cashCostIncludingImportGst(priceUsd, factors);
}

/**
 * Retailer margin % = (MSRP CAD − landed CAD) / MSRP CAD × 100.
 * By default uses landed-before-recoverable-GST when `importGstRecoverable` is true (default).
 */
export function marginPct(
  priceUsd: number,
  msrpCad: number,
  factors: LandedCostFactors,
  options?: { importGstRecoverable?: boolean; landedOverrideCad?: number | null },
): number | null {
  if (msrpCad <= 0) return null;
  const recoverable = options?.importGstRecoverable !== false;
  const landed =
    options?.landedOverrideCad != null && Number.isFinite(options.landedOverrideCad)
      ? options.landedOverrideCad
      : recoverable
        ? landedCadBeforeRecoverableGst(priceUsd, factors)
        : cashCostIncludingImportGst(priceUsd, factors);
  return ((msrpCad - landed) / msrpCad) * 100;
}

/** Per-variant landed CAD (never reuse another size’s wholesale). */
export function variantLandedCad(
  wholesaleUsd: number,
  factors: LandedCostFactors,
  options?: { includeGst?: boolean },
): number {
  return landedCad(wholesaleUsd, factors, options);
}

export function formatMarginRange(items: PriceableItem[], factors: LandedCostFactors): string {
  const sellable = items.filter((it) => it.msrpCad > 0);
  if (!sellable.length) return '—';
  const margins = sellable.map((it) => marginPct(it.priceUsd, it.msrpCad, factors)!);
  return `${Math.min(...margins).toFixed(1)}% – ${Math.max(...margins).toFixed(1)}%`;
}
