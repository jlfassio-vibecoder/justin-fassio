import { describe, expect, it } from 'vitest';
import { defaultOutreachGoalSettings } from '@/lib/outreachGoals';
import {
  computeEffectiveConversionRate,
  computeGoalProgress,
  computeOutreachPace,
} from '@/lib/outreachPace';

const asOfMidMonth = new Date('2026-08-12T18:00:00Z'); // Wed in Vancouver

describe('computeGoalProgress', () => {
  it('MTD remaining uses monthly target and excludes already-active no-ops via caller count', () => {
    const settings = defaultOutreachGoalSettings();
    const progress = computeGoalProgress({
      settings,
      mtdAccounts: 2,
      asOf: asOfMidMonth,
    });
    expect(progress.monthlyTarget).toBe(5);
    expect(progress.mtdAccounts).toBe(2);
    expect(progress.remainingGoal).toBe(3);
    expect(progress.isSellingDay).toBe(true);
    expect(progress.remainingSellingDays).toBeGreaterThan(0);
  });

  it('mid-month target edit recalculates remaining only', () => {
    const settings = { ...defaultOutreachGoalSettings(), monthlyTarget: 8 };
    const progress = computeGoalProgress({
      settings,
      mtdAccounts: 2,
      asOf: asOfMidMonth,
    });
    expect(progress.remainingGoal).toBe(6);

    const lowered = computeGoalProgress({
      settings: { ...settings, monthlyTarget: 1 },
      mtdAccounts: 2,
      asOf: asOfMidMonth,
    });
    expect(lowered.remainingGoal).toBe(0);
  });
});

describe('computeEffectiveConversionRate', () => {
  it('uses planning assumption below sample threshold', () => {
    const settings = defaultOutreachGoalSettings();
    const rate = computeEffectiveConversionRate({
      settings,
      attributedConversions: 3,
      outreachProspects: 100,
    });
    expect(rate.rateSource).toBe('planning');
    expect(rate.effectiveRate).toBe(0.015);
  });

  it('blends after threshold and clamps wild measured rates', () => {
    const settings = defaultOutreachGoalSettings();
    // 50/100 = 50% raw → clamp to 6% then blend
    const rate = computeEffectiveConversionRate({
      settings,
      attributedConversions: 50,
      outreachProspects: 100,
    });
    expect(rate.rateSource).toBe('blended');
    expect(rate.measuredRate).toBe(0.06);
    expect(rate.effectiveRate).toBeCloseTo(0.3 * 0.06 + 0.7 * 0.015, 6);
  });
});

describe('computeOutreachPace', () => {
  it('over-goal → recommended 0', () => {
    const settings = defaultOutreachGoalSettings();
    const progress = computeGoalProgress({
      settings,
      mtdAccounts: 5,
      asOf: asOfMidMonth,
    });
    const rate = computeEffectiveConversionRate({
      settings,
      attributedConversions: 0,
      outreachProspects: 0,
    });
    const pace = computeOutreachPace({ settings, progress, rate });
    expect(pace.goalMet).toBe(true);
    expect(pace.recommendedDailySends).toBe(0);
  });

  it('0 attributed conversions uses planning rate and floors/caps pace', () => {
    const settings = defaultOutreachGoalSettings();
    const progress = computeGoalProgress({
      settings,
      mtdAccounts: 0,
      asOf: asOfMidMonth,
    });
    const rate = computeEffectiveConversionRate({
      settings,
      attributedConversions: 0,
      outreachProspects: 0,
    });
    const pace = computeOutreachPace({ settings, progress, rate });
    expect(pace.rateSource).toBe('planning');
    expect(pace.recommendedDailySends).toBeGreaterThanOrEqual(settings.paceFloor);
    expect(pace.recommendedDailySends).toBeLessThanOrEqual(settings.paceCap);
  });

  it('non-selling day recommends 0 sends', () => {
    const settings = defaultOutreachGoalSettings();
    const asOf = new Date('2026-08-15T18:00:00Z'); // Sat
    const progress = computeGoalProgress({ settings, mtdAccounts: 0, asOf });
    expect(progress.isSellingDay).toBe(false);
    const rate = computeEffectiveConversionRate({
      settings,
      attributedConversions: 0,
      outreachProspects: 0,
    });
    const pace = computeOutreachPace({ settings, progress, rate });
    expect(pace.recommendedDailySends).toBe(0);
  });
});
