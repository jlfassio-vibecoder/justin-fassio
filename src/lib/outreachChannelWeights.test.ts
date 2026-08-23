import { describe, expect, it } from 'vitest';
import { computeChannelAllocationWeights } from '@/lib/outreachChannelWeights';
import { defaultOutreachGoalSettings } from '@/lib/outreachGoals';
import type { OutreachPerformanceReport } from '@/lib/outreachPerformance';

function makeReport(
  channels: Array<{ key: string; sends: number; conversions: number }>,
): OutreachPerformanceReport {
  return {
    lookbackDays: 90,
    minAttributedConversions: 8,
    byChannel: channels.map((c) => ({
      key: c.key,
      label: c.key,
      sends: c.sends,
      attributedConversions: c.conversions,
      conversionRate: c.sends > 0 ? c.conversions / c.sends : null,
      confidence: 'insufficient' as const,
    })),
    byProduct: [],
    byFitBand: [],
    byLeadState: [],
    attributionCohort: { rows: [] },
  };
}

const settings = defaultOutreachGoalSettings();

describe('computeChannelAllocationWeights', () => {
  it('returns uniform when report is null', () => {
    const result = computeChannelAllocationWeights({ report: null, settings });
    expect(result.source).toBe('uniform');
    expect(result.weights).toBeUndefined();
  });

  it('returns uniform when total attributed conversions are below global gate', () => {
    const result = computeChannelAllocationWeights({
      report: makeReport([
        { key: 'golf_retail', sends: 20, conversions: 3 },
        { key: 'marine_retail', sends: 15, conversions: 2 },
      ]),
      settings,
    });
    expect(result.source).toBe('uniform');
    expect(result.weights).toBeUndefined();
  });

  it('returns uniform when total sends are zero', () => {
    const result = computeChannelAllocationWeights({
      report: makeReport([{ key: 'golf_retail', sends: 0, conversions: 10 }]),
      settings,
    });
    expect(result.source).toBe('uniform');
    expect(result.weights).toBeUndefined();
  });

  it('returns uniform when adaptive weights are disabled', () => {
    const report = makeReport([
      { key: 'golf_retail', sends: 20, conversions: 2 },
      { key: 'marine_retail', sends: 20, conversions: 1 },
    ]);
    const result = computeChannelAllocationWeights({
      report,
      settings: { ...settings, adaptiveWeightsEnabled: false },
    });
    expect(result.source).toBe('uniform');
    expect(result.weights).toBeUndefined();
  });

  it('returns measured weights favoring higher-conversion channels', () => {
    const result = computeChannelAllocationWeights({
      report: makeReport([
        { key: 'golf_retail', sends: 50, conversions: 6 },
        { key: 'marine_retail', sends: 50, conversions: 2 },
      ]),
      settings,
    });
    expect(result.source).toBe('measured');
    expect(result.weights).toBeDefined();
    expect(result.weights!.golf_retail).toBeGreaterThan(result.weights!.marine_retail!);
  });

  it('uses global rate for channels below MIN_CHANNEL_SENDS', () => {
    const result = computeChannelAllocationWeights({
      report: makeReport([
        { key: 'golf_retail', sends: 50, conversions: 5 },
        { key: 'marine_retail', sends: 2, conversions: 1 },
        { key: 'grocery', sends: 40, conversions: 3 },
      ]),
      settings,
    });
    expect(result.source).toBe('measured');
    // marine_retail has only 2 sends — should not get extreme weight from 50% raw rate
    const marine = result.weights!.marine_retail!;
    const golf = result.weights!.golf_retail!;
    expect(marine).toBeLessThan(golf);
    expect(marine).toBeGreaterThanOrEqual(settings.measuredRateFloor);
  });

  it('applies measuredRateFloor to every channel weight', () => {
    const result = computeChannelAllocationWeights({
      report: makeReport([
        { key: 'golf_retail', sends: 100, conversions: 8 },
        { key: 'marine_retail', sends: 100, conversions: 0 },
      ]),
      settings,
    });
    expect(result.source).toBe('measured');
    for (const w of Object.values(result.weights ?? {})) {
      expect(w).toBeGreaterThanOrEqual(settings.measuredRateFloor);
    }
  });
});
