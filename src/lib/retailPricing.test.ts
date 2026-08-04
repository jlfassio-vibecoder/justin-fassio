import { describe, expect, it } from 'vitest';
import {
  BC_COMBINED_SALES_TAX_RATE,
  bcConsumerPrices,
  cadWholesaleBeforeTax,
  MIN_ORDER_PIECES,
  minOrderTotalBreakdown,
  retailKeystoneBreakdown,
  retailerGrossProfit,
  suggestedMsrpFromMargin,
} from '@/lib/retailPricing';

const factors = { fx: 1.45, freightRate: 0.1 };

describe('cadWholesaleBeforeTax', () => {
  it('multiplies USD by FX and freight only', () => {
    expect(cadWholesaleBeforeTax(13, factors)).toBeCloseTo(20.735, 3);
  });
});

describe('suggestedMsrpFromMargin', () => {
  it('doubles cost at 50% gross margin', () => {
    expect(suggestedMsrpFromMargin(20.735, 0.5)).toBeCloseTo(41.47, 2);
  });

  it('returns null for invalid margin', () => {
    expect(suggestedMsrpFromMargin(20, 0)).toBeNull();
    expect(suggestedMsrpFromMargin(20, 1)).toBeNull();
    expect(suggestedMsrpFromMargin(20, -0.1)).toBeNull();
  });
});

describe('retailerGrossProfit', () => {
  it('is MSRP minus cost', () => {
    expect(retailerGrossProfit(41.47, 20.735)).toBeCloseTo(20.735, 3);
  });
});

describe('bcConsumerPrices', () => {
  it('applies combined 12% GST+PST to post-tax only', () => {
    const { preTax, postTax } = bcConsumerPrices(41.47);
    expect(preTax).toBeCloseTo(41.47, 2);
    expect(postTax).toBeCloseTo(41.47 * (1 + BC_COMBINED_SALES_TAX_RATE), 2);
    expect(postTax).toBeCloseTo(46.4464, 2);
  });
});

describe('retailKeystoneBreakdown', () => {
  it('matches sample tee at defaults', () => {
    const b = retailKeystoneBreakdown(13, factors, 0.5);
    expect(b).not.toBeNull();
    expect(b!.cadWholesale).toBeCloseTo(20.735, 3);
    expect(b!.suggestedMsrpCad).toBeCloseTo(41.47, 2);
    expect(b!.retailerGrossProfitCad).toBeCloseTo(20.735, 3);
    expect(b!.consumerPostTaxCad).toBeCloseTo(46.45, 2);
  });
});

describe('minOrderTotalBreakdown', () => {
  it('splits 24-pc tee order into wholesale CAD and freight-only shipping', () => {
    const b = minOrderTotalBreakdown(13, factors);
    expect(b).not.toBeNull();
    expect(b!.pieces).toBe(MIN_ORDER_PIECES);
    expect(b!.wholesaleUsd).toBeCloseTo(312, 2);
    expect(b!.wholesaleCad).toBeCloseTo(452.4, 2);
    expect(b!.shippingCad).toBeCloseTo(45.24, 2);
    expect(b!.totalCad).toBeCloseTo(497.64, 2);
    expect(b!.totalCad).toBeCloseTo(24 * cadWholesaleBeforeTax(13, factors), 3);
  });

  it('excludes GST/PST from the total', () => {
    const b = minOrderTotalBreakdown(13, { fx: 1.45, freightRate: 0.1 });
    expect(b!.totalCad).toBeCloseTo(b!.wholesaleCad + b!.shippingCad, 6);
    expect(b!.totalCad).toBeLessThan(b!.wholesaleCad * 1.12 + b!.shippingCad);
  });

  it('returns null for invalid inputs', () => {
    expect(minOrderTotalBreakdown(-1, factors)).toBeNull();
    expect(minOrderTotalBreakdown(13, { fx: 0, freightRate: 0.1 })).toBeNull();
    expect(minOrderTotalBreakdown(13, factors, 0)).toBeNull();
  });
});
