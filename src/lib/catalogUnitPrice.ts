/** Unit-equivalent wholesale from pack pricing (description.md ProductVariant). */
export function unitEquivalentWholesaleUsd(input: {
  wholesaleUsd: number;
  packQuantity?: number | null;
  packPriceUsd?: number | null;
}): number {
  const packQty = input.packQuantity != null && input.packQuantity > 0 ? input.packQuantity : 1;
  if (packQty <= 1) return input.wholesaleUsd;
  if (input.packPriceUsd != null && Number.isFinite(input.packPriceUsd)) {
    return input.packPriceUsd / packQty;
  }
  // Pack wholesale is often the pack total with no separate packPriceUsd.
  return input.wholesaleUsd / packQty;
}
