export function formatWholesaleUsd(amount: number | null | undefined): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  return `US$${amount.toFixed(2)} wholesale`;
}

export function formatSuggestedRetailCad(msrpCad: number): string | null {
  if (!(msrpCad > 0)) return null;
  return `Suggested retail C$${msrpCad.toFixed(2)}`;
}

export function formatMerchandiseSubtotalUsd(amount: number): string {
  return `US$${amount.toFixed(2)}`;
}

export function hasWholesalePricing(wholesaleUsd: number | null | undefined): boolean {
  return wholesaleUsd != null && Number.isFinite(wholesaleUsd);
}
