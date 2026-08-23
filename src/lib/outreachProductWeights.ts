/**
 * Derive product selection weights from Phase 4 performance slices.
 * Mirrors channel/pace conservatism: global gate, then smoothed per-product rates.
 */

import type { OutreachGoalSettings } from '@/lib/outreachGoals';
import type { OutreachPerformanceReport } from '@/lib/outreachPerformance';
import { MIN_PRODUCT_SENDS } from '@/lib/outreachSelectionConstants';

export type ProductWeightSource = 'uniform' | 'measured';

export type ProductSelectionWeightsResult = {
  weights: Map<string, number> | undefined;
  /** Global blended rate for products without a slice or below send floor. */
  globalWeight: number | undefined;
  source: ProductWeightSource;
};

/**
 * Compute product weights for selectProductForProspect within-tier ranking.
 * Returns undefined weights when data is insufficient (caller uses rank-only sort).
 */
export function computeProductSelectionWeights(input: {
  report: OutreachPerformanceReport | null;
  settings: OutreachGoalSettings;
}): ProductSelectionWeightsResult {
  const report = input.report;
  if (!report || !input.settings.adaptiveWeightsEnabled) {
    return { weights: undefined, globalWeight: undefined, source: 'uniform' };
  }

  const totalAttributed = report.byProduct.reduce((sum, row) => sum + row.attributedConversions, 0);
  if (totalAttributed < input.settings.minAttributedConversions) {
    return { weights: undefined, globalWeight: undefined, source: 'uniform' };
  }

  let totalSends = 0;
  let totalConversions = 0;
  for (const row of report.byProduct) {
    if (row.sends > 0) {
      totalSends += row.sends;
      totalConversions += row.attributedConversions;
    }
  }

  if (totalSends <= 0) {
    return { weights: undefined, globalWeight: undefined, source: 'uniform' };
  }

  const globalRate = totalConversions / totalSends;
  const alpha = input.settings.smoothingAlpha;
  const floor = input.settings.measuredRateFloor;
  const globalWeight = Math.max(globalRate, floor);
  const weights = new Map<string, number>();

  for (const row of report.byProduct) {
    const sends = row.sends;
    const conversions = row.attributedConversions;

    let blendedRate: number;
    if (sends < MIN_PRODUCT_SENDS) {
      blendedRate = globalRate;
    } else {
      const rawRate = conversions / sends;
      blendedRate = alpha * rawRate + (1 - alpha) * globalRate;
    }

    weights.set(row.key, Math.max(blendedRate, floor));
  }

  return { weights, globalWeight, source: 'measured' };
}
