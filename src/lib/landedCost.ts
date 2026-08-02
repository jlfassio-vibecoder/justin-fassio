export interface PriceableItem {
  priceUsd: number;
  msrpCad: number;
}

export function landedCad(priceUsd: number, fx: number, freight: number): number {
  return priceUsd * fx * freight;
}

export function marginPct(
  priceUsd: number,
  msrpCad: number,
  fx: number,
  freight: number,
): number | null {
  if (msrpCad <= 0) return null;
  return ((msrpCad - landedCad(priceUsd, fx, freight)) / msrpCad) * 100;
}

export function formatMarginRange(items: PriceableItem[], fx: number, freight: number): string {
  const sellable = items.filter((it) => it.msrpCad > 0);
  if (!sellable.length) return '—';
  const margins = sellable.map((it) => marginPct(it.priceUsd, it.msrpCad, fx, freight)!);
  return `${Math.min(...margins).toFixed(1)}% – ${Math.max(...margins).toFixed(1)}%`;
}
