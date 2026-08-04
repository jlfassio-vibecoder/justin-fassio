import {
  getRetailCategoryBaseline,
  normalizeRetailCategory,
  type RetailCategory,
} from '@/lib/prospectEnrichment/retailCategoryConfig';
import { isDenseSubterritory, isRemoteSubterritory } from '@/lib/prospectEnrichment/bcTerritory';

export type SeedFitInput = {
  retailCategory: RetailCategory | string;
  subterritory: string | null | undefined;
  strategicReference?: boolean;
};

export type SeedFitResult = {
  seedFitScore: number;
  categoryBaseFit: number;
  geographicAdjustment: number;
  strategicReferenceAdjustment: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Provisional seed fit from category baseline + geo + optional strategic reference (doc §4).
 */
export function calculateSeedFitScore(input: SeedFitInput): SeedFitResult {
  const category = normalizeRetailCategory(input.retailCategory) ?? 'Other / needs review';
  const baseline = getRetailCategoryBaseline(category);
  const categoryBaseFit = baseline.baseFit;

  let geographicAdjustment = 0;
  if (isDenseSubterritory(input.subterritory)) geographicAdjustment = 1;
  else if (isRemoteSubterritory(input.subterritory)) geographicAdjustment = -1;

  const strategicReferenceAdjustment = input.strategicReference ? 1 : 0;

  const seedFitScore = clamp(
    categoryBaseFit + geographicAdjustment + strategicReferenceAdjustment,
    4,
    10,
  );

  return {
    seedFitScore,
    categoryBaseFit,
    geographicAdjustment,
    strategicReferenceAdjustment,
  };
}

export function idealOpeningUnitsForCategory(
  retailCategory: RetailCategory | string | null | undefined,
): number {
  const category = normalizeRetailCategory(retailCategory ?? '') ?? 'Other / needs review';
  return getRetailCategoryBaseline(category).idealOpeningUnits;
}
