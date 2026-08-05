/** Unit-equivalent wholesale from pack pricing (description.md ProductVariant). */
export function unitEquivalentWholesaleUsd(input: {
  wholesaleUsd: number;
  packQuantity?: number | null;
  packPriceUsd?: number | null;
}): number {
  const packQty = input.packQuantity != null && input.packQuantity > 0 ? input.packQuantity : 1;
  if (input.packPriceUsd != null && Number.isFinite(input.packPriceUsd) && packQty > 1) {
    return input.packPriceUsd / packQty;
  }
  return input.wholesaleUsd;
}
