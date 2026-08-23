import { describe, expect, it } from 'vitest';
import { defaultOutreachGoalSettings } from '@/lib/outreachGoals';
import { OUTREACH_LEAD_RULES } from '@/lib/outreachLeadRules';
import {
  computeCalibratedLeadRules,
  opensOnlyCannotBecomeHot,
} from '@/lib/outreachLeadRuleCalibration';
import type { OutreachPerformanceReport } from '@/lib/outreachPerformance';

const settings = defaultOutreachGoalSettings();

function makeReport(
  leadStates: Array<{ key: string; sends: number; conversions: number }>,
): OutreachPerformanceReport {
  return {
    lookbackDays: 90,
    minAttributedConversions: 8,
    byChannel: [],
    byProduct: [],
    byFitBand: [],
    byLeadState: leadStates.map((row) => ({
      key: row.key,
      label: row.key,
      sends: row.sends,
      attributedConversions: row.conversions,
      conversionRate: row.sends > 0 ? row.conversions / row.sends : null,
      confidence: 'insufficient' as const,
    })),
    attributionCohort: { rows: [] },
  };
}

describe('computeCalibratedLeadRules', () => {
  it('returns provisional rules when report is null', () => {
    const result = computeCalibratedLeadRules({
      report: null,
      cohort: { rows: [] },
      settings,
    });
    expect(result.source).toBe('provisional');
    expect(result.rules.version).toBe('v1-provisional');
    expect(result.rules).toEqual(OUTREACH_LEAD_RULES);
  });

  it('returns provisional rules below global gate', () => {
    const result = computeCalibratedLeadRules({
      report: makeReport([
        { key: 'hot', sends: 20, conversions: 3 },
        { key: 'warm', sends: 30, conversions: 2 },
      ]),
      cohort: { rows: [] },
      settings,
    });
    expect(result.source).toBe('provisional');
  });

  it('returns measured rules when gate passes and adjusts fields', () => {
    const cohortRows = Array.from({ length: 8 }, (_, index) => ({
      leadState: (index < 5 ? 'hot' : 'warm') as 'hot' | 'warm',
      leadScore: index < 5 ? 12 : 5,
      engagement: {
        openCount: index % 2,
        clickCount: index < 6 ? 2 : 0,
        replyAttributed: index === 0,
        emailsSent: 2,
      },
      recencyDays: 3,
    }));

    const result = computeCalibratedLeadRules({
      report: makeReport([
        { key: 'hot', sends: 40, conversions: 6 },
        { key: 'warm', sends: 60, conversions: 2 },
        { key: 'cold', sends: 100, conversions: 0 },
      ]),
      cohort: { rows: cohortRows },
      settings,
    });

    expect(result.source).toBe('measured');
    expect(result.rules.version).toBe('v1-measured');
    expect(result.meta.adjustedFields.length).toBeGreaterThan(0);
    expect(opensOnlyCannotBecomeHot(result.rules)).toBe(true);
  });

  it('keeps point weights within clamp bounds', () => {
    const cohortRows = Array.from({ length: 10 }, () => ({
      leadState: 'hot' as const,
      leadScore: 15,
      engagement: {
        openCount: 0,
        clickCount: 4,
        replyAttributed: true,
        emailsSent: 3,
      },
      recencyDays: 2,
    }));

    const result = computeCalibratedLeadRules({
      report: makeReport([
        { key: 'hot', sends: 50, conversions: 10 },
        { key: 'warm', sends: 50, conversions: 0 },
      ]),
      cohort: { rows: cohortRows },
      settings,
    });

    expect(result.rules.pointsClickedProduct).toBeGreaterThanOrEqual(
      Math.round(OUTREACH_LEAD_RULES.pointsClickedProduct * 0.6),
    );
    expect(result.rules.pointsClickedProduct).toBeLessThanOrEqual(
      Math.round(OUTREACH_LEAD_RULES.pointsClickedProduct * 1.4),
    );
    expect(result.rules.pointsClickedProduct).toBeGreaterThanOrEqual(
      result.rules.pointsOpenOnlyProduct * 3,
    );
  });
});
