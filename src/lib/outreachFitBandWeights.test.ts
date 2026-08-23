import { describe, expect, it } from 'vitest';
import { computeFitBandRankingWeights } from '@/lib/outreachFitBandWeights';
import { defaultOutreachGoalSettings } from '@/lib/outreachGoals';
import type { OutreachPerformanceReport } from '@/lib/outreachPerformance';

function makeReport(
  bands: Array<{ key: string; sends: number; conversions: number }>,
): OutreachPerformanceReport {
  return {
    lookbackDays: 90,
    minAttributedConversions: 8,
    byChannel: [],
    byProduct: [],
    byFitBand: bands.map((b) => ({
      key: b.key,
      label: `Fit ${b.key}`,
      sends: b.sends,
      attributedConversions: b.conversions,
      conversionRate: b.sends > 0 ? b.conversions / b.sends : null,
      confidence: 'insufficient' as const,
    })),
    byLeadState: [],
    attributionCohort: { rows: [] },
  };
}

const settings = defaultOutreachGoalSettings();

describe('computeFitBandRankingWeights', () => {
  it('returns uniform when report is null', () => {
    const result = computeFitBandRankingWeights({ report: null, settings });
    expect(result.source).toBe('uniform');
    expect(result.weights).toBeUndefined();
    expect(result.globalWeight).toBeUndefined();
  });

  it('returns uniform when total attributed conversions are below global gate', () => {
    const result = computeFitBandRankingWeights({
      report: makeReport([
        { key: '8-10', sends: 20, conversions: 3 },
        { key: '6-7', sends: 15, conversions: 2 },
      ]),
      settings,
    });
    expect(result.source).toBe('uniform');
    expect(result.weights).toBeUndefined();
  });

  it('returns uniform when total sends are zero', () => {
    const result = computeFitBandRankingWeights({
      report: makeReport([{ key: '8-10', sends: 0, conversions: 10 }]),
      settings,
    });
    expect(result.source).toBe('uniform');
    expect(result.weights).toBeUndefined();
  });

  it('returns measured weights favoring higher-conversion bands', () => {
    const result = computeFitBandRankingWeights({
      report: makeReport([
        { key: '8-10', sends: 50, conversions: 6 },
        { key: '1-5', sends: 50, conversions: 2 },
      ]),
      settings,
    });
    expect(result.source).toBe('measured');
    expect(result.weights).toBeDefined();
    expect(result.globalWeight).toBeDefined();
    expect(result.weights!.get('8-10')!).toBeGreaterThan(result.weights!.get('1-5')!);
  });

  it('uses global rate for bands below MIN_FIT_BAND_SENDS', () => {
    const result = computeFitBandRankingWeights({
      report: makeReport([
        { key: '8-10', sends: 50, conversions: 6 },
        { key: '6-7', sends: 2, conversions: 2 },
      ]),
      settings,
    });
    expect(result.source).toBe('measured');
    const sparse = result.weights!.get('6-7')!;
    expect(sparse).toBe(result.globalWeight);
    expect(result.weights!.get('8-10')).toBeDefined();
  });

  it('applies measuredRateFloor to every band weight', () => {
    const result = computeFitBandRankingWeights({
      report: makeReport([
        { key: '8-10', sends: 100, conversions: 8 },
        { key: '1-5', sends: 100, conversions: 0 },
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
