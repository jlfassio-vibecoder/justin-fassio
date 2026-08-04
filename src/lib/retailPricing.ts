/** British Columbia consumer sales tax (applied at POS on ticket MSRP). */
export const BC_GST_RATE = 0.05;
export const BC_PST_RATE = 0.07;
export const BC_COMBINED_SALES_TAX_RATE = BC_GST_RATE + BC_PST_RATE;

export const DEFAULT_KEYSTONE_MARGIN_RATE = 0.5;

/** Brand minimum order quantity (pieces), per wholesale terms. */
export const MIN_ORDER_PIECES = 24;

export type WholesaleFxFreight = {
  fx: number;
  freightRate: number;
};

/** CAD cost basis for retailer keystone — USD × FX × (1+freight), excluding GST/other. */
export function cadWholesaleBeforeTax(priceUsd: number, factors: WholesaleFxFreight): number {
  return priceUsd * factors.fx * (1 + factors.freightRate);
}

/**
 * Suggested ticket MSRP from target gross margin rate.
 * 50% margin → cost / 0.5 = 2× cost. Returns null if margin is not in (0, 1).
 */
export function suggestedMsrpFromMargin(costCad: number, marginRate: number): number | null {
  if (!(marginRate > 0 && marginRate < 1) || !Number.isFinite(costCad) || costCad < 0) {
    return null;
  }
  return costCad / (1 - marginRate);
}

export function retailerGrossProfit(msrpCad: number, costCad: number): number {
  return msrpCad - costCad;
}

export function bcConsumerPrices(msrpCad: number): { preTax: number; postTax: number } {
  return {
    preTax: msrpCad,
    postTax: msrpCad * (1 + BC_COMBINED_SALES_TAX_RATE),
  };
}

export type RetailKeystoneBreakdown = {
  cadWholesale: number;
  suggestedMsrpCad: number;
  retailerGrossProfitCad: number;
  consumerPreTaxCad: number;
  consumerPostTaxCad: number;
  marginRate: number;
};

/** Full sample-unit breakdown for Line Sheet keystone cards. */
export function retailKeystoneBreakdown(
  priceUsd: number,
  factors: WholesaleFxFreight,
  marginRate: number,
): RetailKeystoneBreakdown | null {
  const cadWholesale = cadWholesaleBeforeTax(priceUsd, factors);
  const suggestedMsrpCad = suggestedMsrpFromMargin(cadWholesale, marginRate);
  if (suggestedMsrpCad == null) return null;
  const consumer = bcConsumerPrices(suggestedMsrpCad);
  return {
    cadWholesale,
    suggestedMsrpCad,
    retailerGrossProfitCad: retailerGrossProfit(suggestedMsrpCad, cadWholesale),
    consumerPreTaxCad: consumer.preTax,
    consumerPostTaxCad: consumer.postTax,
    marginRate,
  };
}

export type MinOrderTotalBreakdown = {
  pieces: number;
  unitPriceUsd: number;
  wholesaleUsd: number;
  /** Goods only in CAD (USD × FX × pieces) — no freight, no tax. */
  wholesaleCad: number;
  /** Estimated freight in CAD (wholesaleCad × freightRate) — no tax. */
  shippingCad: number;
  /** Wholesale + shipping in CAD — no GST/PST. */
  totalCad: number;
};

/**
 * Minimum-order estimate for a sample unit price: goods + freight only.
 * Shipping uses the landed freight % applied to CAD wholesale (ex-tax).
 */
export function minOrderTotalBreakdown(
  priceUsd: number,
  factors: WholesaleFxFreight,
  pieces: number = MIN_ORDER_PIECES,
): MinOrderTotalBreakdown | null {
  if (!(priceUsd >= 0) || !Number.isFinite(priceUsd) || !(pieces > 0) || !Number.isFinite(pieces)) {
    return null;
  }
  if (!Number.isFinite(factors.fx) || factors.fx <= 0) return null;
  if (!Number.isFinite(factors.freightRate) || factors.freightRate < 0) return null;

  const wholesaleUsd = pieces * priceUsd;
  const wholesaleCad = wholesaleUsd * factors.fx;
  const shippingCad = wholesaleCad * factors.freightRate;
  return {
    pieces,
    unitPriceUsd: priceUsd,
    wholesaleUsd,
    wholesaleCad,
    shippingCad,
    totalCad: wholesaleCad + shippingCad,
  };
}
