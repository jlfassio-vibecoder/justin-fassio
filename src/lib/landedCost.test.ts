import { describe, expect, it } from 'vitest';
import {
  cashCostIncludingImportGst,
  formatMarginRange,
  formatRatePct,
  landedCad,
  landedCadBeforeRecoverableGst,
  marginPct,
  variantLandedCad,
  type LandedCostFactors,
} from '@/lib/landedCost';

/** Prior stack parity: freight 10%, no GST/other (matches usd * fx * 1.1). */
const parityFactors: LandedCostFactors = {
  fx: 1.45,
  freightRate: 0.1,
  gstRate: 0,
  otherTaxRate: 0,
};

const withGst: LandedCostFactors = {
  ...parityFactors,
  gstRate: 0.05,
};

describe('formatRatePct', () => {
  it('formats rates as whole percents', () => {
    expect(formatRatePct(0.1)).toBe('10%');
    expect(formatRatePct(0.05)).toBe('5%');
    expect(formatRatePct(0)).toBe('0%');
  });
});

describe('landedCad', () => {
  it('matches prior fx * 1.1 stack when gst and other are zero', () => {
    expect(landedCad(13, parityFactors)).toBeCloseTo(20.735, 3);
  });

  it('applies GST on top of FX and freight', () => {
    expect(landedCad(13, withGst)).toBeCloseTo(20.735 * 1.05, 3);
  });

  it('can exclude GST via includeGst option', () => {
    expect(landedCad(13, withGst, { includeGst: false })).toBeCloseTo(20.735, 3);
  });
});

describe('landedCadBeforeRecoverableGst / cashCost', () => {
  it('splits recoverable GST from product cost', () => {
    expect(landedCadBeforeRecoverableGst(13, withGst)).toBeCloseTo(20.735, 3);
    expect(cashCostIncludingImportGst(13, withGst)).toBeCloseTo(20.735 * 1.05, 3);
  });
});

describe('marginPct', () => {
  it('returns retailer margin for sellable items', () => {
    const pct = marginPct(13, 39.99, parityFactors);
    expect(pct).not.toBeNull();
    expect(pct!).toBeCloseTo(((39.99 - 20.735) / 39.99) * 100, 3);
  });

  it('uses landed before recoverable GST by default', () => {
    const pct = marginPct(13, 39.99, withGst);
    expect(pct!).toBeCloseTo(((39.99 - 20.735) / 39.99) * 100, 3);
  });

  it('can treat GST as non-recoverable cost', () => {
    const pct = marginPct(13, 39.99, withGst, { importGstRecoverable: false });
    expect(pct!).toBeCloseTo(((39.99 - 20.735 * 1.05) / 39.99) * 100, 3);
  });

  it('honors manual landed override', () => {
    const pct = marginPct(13, 40, withGst, { landedOverrideCad: 20 });
    expect(pct!).toBeCloseTo(50, 3);
  });

  it('returns null for non-resale items', () => {
    expect(marginPct(50, 0, parityFactors)).toBeNull();
  });
});

describe('variantLandedCad', () => {
  it('computes independently per wholesale so size bands differ', () => {
    const mxl = variantLandedCad(13, withGst, { includeGst: false });
    const twox = variantLandedCad(14, withGst, { includeGst: false });
    expect(twox).toBeGreaterThan(mxl);
  });
});

describe('formatMarginRange', () => {
  it('returns an em dash when nothing is sellable', () => {
    expect(formatMarginRange([{ priceUsd: 10, msrpCad: 0 }], parityFactors)).toBe('—');
  });

  it('formats min–max margin across sellable items', () => {
    const display = formatMarginRange(
      [
        { priceUsd: 13, msrpCad: 39.99 },
        { priceUsd: 13, msrpCad: 49.99 },
        { priceUsd: 80, msrpCad: 0 },
      ],
      parityFactors,
    );
    const low = marginPct(13, 39.99, parityFactors)!;
    const high = marginPct(13, 49.99, parityFactors)!;
    expect(display).toBe(`${Math.min(low, high).toFixed(1)}% – ${Math.max(low, high).toFixed(1)}%`);
  });
});
