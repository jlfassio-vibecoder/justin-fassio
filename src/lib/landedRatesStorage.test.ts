import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LANDED_COST_FACTORS } from '@/lib/landedCost';
import {
  LANDED_RATES_STORAGE_KEY,
  loadLandedRatesPersistence,
  parseLandedRatesPersistence,
  saveLandedRatesPersistence,
} from '@/lib/landedRatesStorage';

describe('parseLandedRatesPersistence', () => {
  it('returns null for invalid shapes', () => {
    expect(parseLandedRatesPersistence(null)).toBeNull();
    expect(parseLandedRatesPersistence({})).toBeNull();
    expect(parseLandedRatesPersistence({ fx: '1.4' })).toBeNull();
  });

  it('clamps and accepts a valid blob', () => {
    const parsed = parseLandedRatesPersistence({
      fx: 1.38,
      freightRate: 0.1,
      gstRate: 0.05,
      otherTaxRate: 0,
      asOf: '2026-08-03T12:00:00.000Z',
      brief: 'USD/CAD 1.38',
    });
    expect(parsed).toEqual({
      fx: 1.38,
      freightRate: 0.1,
      gstRate: 0.05,
      otherTaxRate: 0,
      asOf: '2026-08-03T12:00:00.000Z',
      brief: 'USD/CAD 1.38',
      keystoneMarginRate: 0.5,
    });
  });
});

describe('load/saveLandedRatesPersistence', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
  });

  it('round-trips rates through localStorage', () => {
    saveLandedRatesPersistence({
      fx: 1.42,
      freightRate: 0.12,
      gstRate: 0.05,
      otherTaxRate: 0.07,
      asOf: '2026-08-03T15:00:00.000Z',
      brief: 'Test brief',
      keystoneMarginRate: 0.55,
    });
    expect(store.get(LANDED_RATES_STORAGE_KEY)).toBeTruthy();
    expect(loadLandedRatesPersistence()).toEqual({
      fx: 1.42,
      freightRate: 0.12,
      gstRate: 0.05,
      otherTaxRate: 0.07,
      asOf: '2026-08-03T15:00:00.000Z',
      brief: 'Test brief',
      keystoneMarginRate: 0.55,
    });
  });

  it('falls back to defaults on corrupt JSON', () => {
    store.set(LANDED_RATES_STORAGE_KEY, '{not-json');
    expect(loadLandedRatesPersistence()).toEqual({
      ...DEFAULT_LANDED_COST_FACTORS,
      asOf: null,
      brief: null,
      keystoneMarginRate: 0.5,
    });
  });
});
