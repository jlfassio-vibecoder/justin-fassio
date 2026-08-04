import { DEFAULT_LANDED_COST_FACTORS, type LandedCostFactors } from '@/lib/landedCost';

export const LANDED_RATES_STORAGE_KEY = 'rcc.landedCostFactors';

export type LandedRatesPersistence = LandedCostFactors & {
  asOf: string | null;
  brief: string | null;
};

function clampFx(value: number): number {
  return Math.min(2.5, Math.max(1, value));
}

function clampRate(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Parse and validate a persistence blob; null if unusable. */
export function parseLandedRatesPersistence(raw: unknown): LandedRatesPersistence | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (
    !isFiniteNumber(o.fx) ||
    !isFiniteNumber(o.freightRate) ||
    !isFiniteNumber(o.gstRate) ||
    !isFiniteNumber(o.otherTaxRate)
  ) {
    return null;
  }

  const asOf =
    typeof o.asOf === 'string' && o.asOf.trim() ? o.asOf.trim() : o.asOf === null ? null : null;
  const brief =
    typeof o.brief === 'string' && o.brief.trim() ? o.brief.trim() : o.brief === null ? null : null;

  return {
    fx: clampFx(o.fx),
    freightRate: clampRate(o.freightRate),
    gstRate: clampRate(o.gstRate),
    otherTaxRate: clampRate(o.otherTaxRate),
    asOf,
    brief,
  };
}

export function defaultLandedRatesPersistence(): LandedRatesPersistence {
  return {
    ...DEFAULT_LANDED_COST_FACTORS,
    asOf: null,
    brief: null,
  };
}

/** Read persisted rates from localStorage (SSR-safe). */
export function loadLandedRatesPersistence(): LandedRatesPersistence {
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaultLandedRatesPersistence();
  }
  try {
    const raw = window.localStorage.getItem(LANDED_RATES_STORAGE_KEY);
    if (!raw) return defaultLandedRatesPersistence();
    const parsed = parseLandedRatesPersistence(JSON.parse(raw) as unknown);
    return parsed ?? defaultLandedRatesPersistence();
  } catch {
    return defaultLandedRatesPersistence();
  }
}

/** Write rates to localStorage (no-op when storage unavailable). */
export function saveLandedRatesPersistence(data: LandedRatesPersistence): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const normalized = parseLandedRatesPersistence(data);
    if (!normalized) return;
    window.localStorage.setItem(LANDED_RATES_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Quota / private mode — ignore
  }
}
