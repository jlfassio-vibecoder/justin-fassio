/** Labeled currency helpers for the public wholesale showroom. */

export function formatWholesaleUsd(amount: number): string {
  return `US$${amount.toFixed(2)} wholesale`;
}

export function formatSuggestedRetailCad(msrpCad: number): string | null {
  if (!(msrpCad > 0)) return null;
  return `Suggested retail C$${msrpCad.toFixed(2)}`;
}

export function formatMerchandiseSubtotalUsd(amount: number): string {
  return `US$${amount.toFixed(2)}`;
}
