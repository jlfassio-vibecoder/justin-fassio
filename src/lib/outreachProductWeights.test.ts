import { describe, expect, it } from 'vitest';
import { computeProductSelectionWeights } from '@/lib/outreachProductWeights';
import { defaultOutreachGoalSettings } from '@/lib/outreachGoals';
import type { OutreachPerformanceReport } from '@/lib/outreachPerformance';

function makeReport(
  products: Array<{ key: string; sends: number; conversions: number }>,
): OutreachPerformanceReport {
  return {
    lookbackDays: 90,
    minAttributedConversions: 8,
    byChannel: [],
    byProduct: products.map((p) => ({
      key: p.key,
      label: p.key,
      sends: p.sends,
      attributedConversions: p.conversions,
      conversionRate: p.sends > 0 ? p.conversions / p.sends : null,
      confidence: 'insufficient' as const,
    })),
    byFitBand: [],
    byLeadState: [],
    attributionCohort: { rows: [] },
  };
}

const settings = defaultOutreachGoalSettings();

describe('computeProductSelectionWeights', () => {
  it('returns uniform when report is null', () => {
    const result = computeProductSelectionWeights({ report: null, settings });
    expect(result.source).toBe('uniform');
    expect(result.weights).toBeUndefined();
    expect(result.globalWeight).toBeUndefined();
  });

  it('returns uniform when total attributed conversions are below global gate', () => {
    const result = computeProductSelectionWeights({
      report: makeReport([
        { key: 'p1', sends: 20, conversions: 3 },
        { key: 'p2', sends: 15, conversions: 2 },
      ]),
      settings,
    });
    expect(result.source).toBe('uniform');
    expect(result.weights).toBeUndefined();
  });

  it('returns uniform when total sends are zero', () => {
    const result = computeProductSelectionWeights({
      report: makeReport([{ key: 'p1', sends: 0, conversions: 10 }]),
      settings,
    });
    expect(result.source).toBe('uniform');
    expect(result.weights).toBeUndefined();
  });

  it('returns measured weights favoring higher-conversion products', () => {
    const result = computeProductSelectionWeights({
      report: makeReport([
        { key: 'p-high', sends: 50, conversions: 6 },
        { key: 'p-low', sends: 50, conversions: 2 },
      ]),
      settings,
    });
    expect(result.source).toBe('measured');
    expect(result.weights).toBeDefined();
    expect(result.globalWeight).toBeDefined();
    expect(result.weights!.get('p-high')!).toBeGreaterThan(result.weights!.get('p-low')!);
  });

  it('uses global rate for products below MIN_PRODUCT_SENDS', () => {
    const result = computeProductSelectionWeights({
      report: makeReport([
        { key: 'p-trusted', sends: 50, conversions: 6 },
        { key: 'p-sparse', sends: 2, conversions: 2 },
      ]),
      settings,
    });
    expect(result.source).toBe('measured');
    const sparse = result.weights!.get('p-sparse')!;
    expect(sparse).toBe(result.globalWeight);
    expect(result.weights!.get('p-trusted')).toBeDefined();
  });

  it('applies measuredRateFloor to every product weight', () => {
    const result = computeProductSelectionWeights({
      report: makeReport([
        { key: 'p1', sends: 100, conversions: 8 },
        { key: 'p2', sends: 100, conversions: 0 },
      ]),
      settings,
    });
    expect(result.source).toBe('measured');
    for (const w of result.weights!.values()) {
      expect(w).toBeGreaterThanOrEqual(settings.measuredRateFloor);
    }
    expect(result.globalWeight).toBeGreaterThanOrEqual(settings.measuredRateFloor);
  });
});
