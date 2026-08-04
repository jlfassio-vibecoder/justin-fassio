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

export function landedCad(
  priceUsd: number,
  factors: LandedCostFactors,
  options?: { includeGst?: boolean },
): number {
  const gstRate = options?.includeGst === false ? 0 : factors.gstRate;
  return (
    priceUsd * factors.fx * (1 + factors.freightRate) * (1 + gstRate) * (1 + factors.otherTaxRate)
  );
}

export function marginPct(
  priceUsd: number,
  msrpCad: number,
  factors: LandedCostFactors,
): number | null {
  if (msrpCad <= 0) return null;
  return ((msrpCad - landedCad(priceUsd, factors)) / msrpCad) * 100;
}

export function formatMarginRange(items: PriceableItem[], factors: LandedCostFactors): string {
  const sellable = items.filter((it) => it.msrpCad > 0);
  if (!sellable.length) return '—';
  const margins = sellable.map((it) => marginPct(it.priceUsd, it.msrpCad, factors)!);
  return `${Math.min(...margins).toFixed(1)}% – ${Math.max(...margins).toFixed(1)}%`;
}
