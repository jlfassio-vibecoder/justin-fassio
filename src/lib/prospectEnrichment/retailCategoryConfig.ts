/** Canonical retail categories and seed baselines from the BC prospect enrichment doc. */

export const RETAIL_CATEGORIES = [
  'Golf pro shop',
  'Fishing / outdoor retailer',
  'Marine dealer / supply',
  'Marina / resort store',
  'RV dealer / campground',
  'Hardware / farm store with apparel',
  'Motorcycle dealer',
  'Independent gift / tourist store',
  'Museum / attraction / resort shop',
  "Men's specialty / lifestyle",
  'Other / needs review',
] as const;

export type RetailCategory = (typeof RETAIL_CATEGORIES)[number];

export type RetailCategoryBaseline = {
  baseFit: number;
  baseAnnualPotentialUsd: number;
  idealOpeningUnits: number;
};

/** Category baselines (doc §4). “Other / needs review” uses cautious defaults. */
export const RETAIL_CATEGORY_BASELINES: Record<RetailCategory, RetailCategoryBaseline> = {
  'Golf pro shop': { baseFit: 9, baseAnnualPotentialUsd: 3600, idealOpeningUnits: 60 },
  'Fishing / outdoor retailer': { baseFit: 9, baseAnnualPotentialUsd: 3300, idealOpeningUnits: 60 },
  'Marine dealer / supply': { baseFit: 8, baseAnnualPotentialUsd: 3000, idealOpeningUnits: 60 },
  'Marina / resort store': { baseFit: 8, baseAnnualPotentialUsd: 3300, idealOpeningUnits: 60 },
  'RV dealer / campground': { baseFit: 8, baseAnnualPotentialUsd: 2400, idealOpeningUnits: 48 },
  'Hardware / farm store with apparel': {
    baseFit: 7,
    baseAnnualPotentialUsd: 2100,
    idealOpeningUnits: 48,
  },
  'Motorcycle dealer': { baseFit: 7, baseAnnualPotentialUsd: 2200, idealOpeningUnits: 48 },
  'Independent gift / tourist store': {
    baseFit: 9,
    baseAnnualPotentialUsd: 3200,
    idealOpeningUnits: 60,
  },
  'Museum / attraction / resort shop': {
    baseFit: 8,
    baseAnnualPotentialUsd: 2800,
    idealOpeningUnits: 48,
  },
  "Men's specialty / lifestyle": {
    baseFit: 7,
    baseAnnualPotentialUsd: 2400,
    idealOpeningUnits: 48,
  },
  'Other / needs review': { baseFit: 5, baseAnnualPotentialUsd: 1200, idealOpeningUnits: 24 },
};

export function normalizeRetailCategory(raw: string | null | undefined): RetailCategory | null {
  if (!raw?.trim()) return null;
  const t = raw.trim().toLowerCase();
  for (const cat of RETAIL_CATEGORIES) {
    if (cat.toLowerCase() === t) return cat;
  }
  // Common sheet spelling without curly apostrophe
  if (t === "men's specialty / lifestyle" || t === 'mens specialty / lifestyle') {
    return "Men's specialty / lifestyle";
  }
  return null;
}

export function getRetailCategoryBaseline(category: RetailCategory): RetailCategoryBaseline {
  return RETAIL_CATEGORY_BASELINES[category];
}
