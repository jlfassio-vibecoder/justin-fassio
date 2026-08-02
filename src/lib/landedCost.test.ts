import { describe, expect, it } from 'vitest';
import { formatMarginRange, landedCad, marginPct } from '@/lib/landedCost';

describe('landedCad', () => {
  it('multiplies wholesale by FX and freight', () => {
    expect(landedCad(13, 1.45, 1.1)).toBeCloseTo(20.735, 3);
  });
});

describe('marginPct', () => {
  it('returns retailer margin for sellable items', () => {
    const pct = marginPct(13, 39.99, 1.45, 1.1);
    expect(pct).not.toBeNull();
    expect(pct!).toBeCloseTo(((39.99 - 20.735) / 39.99) * 100, 3);
  });

  it('returns null for non-resale items', () => {
    expect(marginPct(50, 0, 1.45, 1.1)).toBeNull();
  });
});

describe('formatMarginRange', () => {
  it('returns an em dash when nothing is sellable', () => {
    expect(formatMarginRange([{ priceUsd: 10, msrpCad: 0 }], 1.45, 1.1)).toBe('—');
  });

  it('formats min–max margin across sellable items', () => {
    const display = formatMarginRange(
      [
        { priceUsd: 13, msrpCad: 39.99 },
        { priceUsd: 13, msrpCad: 49.99 },
        { priceUsd: 80, msrpCad: 0 },
      ],
      1.45,
      1.1,
    );
    const low = marginPct(13, 39.99, 1.45, 1.1)!;
    const high = marginPct(13, 49.99, 1.45, 1.1)!;
    expect(display).toBe(`${Math.min(low, high).toFixed(1)}% – ${Math.max(low, high).toFixed(1)}%`);
  });
});
