/**
 * Phase 4 goal progress + recommended daily outreach pace.
 * Planning assumption until enough attributed conversions; then blended + clamped.
 */

import type { OutreachGoalSettings } from '@/lib/outreachGoals';
import { remainingSellingDaysInMonth } from '@/lib/outreachSellingDays';

export type RateSource = 'planning' | 'blended';

export type GoalProgressInput = {
  settings: OutreachGoalSettings;
  /** Active accounts with converted_at in current business-TZ month. */
  mtdAccounts: number;
  asOf?: Date;
};

export type GoalProgress = {
  monthlyTarget: number;
  mtdAccounts: number;
  remainingGoal: number;
  remainingSellingDays: number;
  isSellingDay: boolean;
  monthEnded: boolean;
  yearMonth: string;
  today: string;
};

export function computeGoalProgress(input: GoalProgressInput): GoalProgress {
  const asOf = input.asOf ?? new Date();
  const days = remainingSellingDaysInMonth({
    asOf,
    timeZone: input.settings.businessTimezone,
  });
  const mtd = Math.max(0, Math.floor(input.mtdAccounts));
  const remainingGoal = Math.max(0, input.settings.monthlyTarget - mtd);
  return {
    monthlyTarget: input.settings.monthlyTarget,
    mtdAccounts: mtd,
    remainingGoal,
    remainingSellingDays: days.remainingDays,
    isSellingDay: days.isSellingDay,
    monthEnded: days.monthEnded || (days.remainingDays === 0 && days.today > days.month.monthStart),
    yearMonth: days.month.yearMonth,
    today: days.today,
  };
}

export type EffectiveRateInput = {
  settings: OutreachGoalSettings;
  /** Attributed conversions in lookback with a linked message. */
  attributedConversions: number;
  /** Distinct prospects with ≥1 product_outreach send in lookback. */
  outreachProspects: number;
};

export type EffectiveRateResult = {
  effectiveRate: number;
  measuredRate: number | null;
  rateSource: RateSource;
  attributedConversions: number;
  outreachProspects: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function computeEffectiveConversionRate(input: EffectiveRateInput): EffectiveRateResult {
  const { settings } = input;
  const attributed = Math.max(0, Math.floor(input.attributedConversions));
  const prospects = Math.max(0, Math.floor(input.outreachProspects));

  if (attributed < settings.minAttributedConversions || prospects <= 0) {
    return {
      effectiveRate: settings.planningConversionRate,
      measuredRate: prospects > 0 ? attributed / prospects : null,
      rateSource: 'planning',
      attributedConversions: attributed,
      outreachProspects: prospects,
    };
  }

  const rawMeasured = attributed / prospects;
  const measuredRate = clamp(rawMeasured, settings.measuredRateFloor, settings.measuredRateCap);
  const effectiveRate =
    settings.smoothingAlpha * measuredRate +
    (1 - settings.smoothingAlpha) * settings.planningConversionRate;

  return {
    effectiveRate,
    measuredRate,
    rateSource: 'blended',
    attributedConversions: attributed,
    outreachProspects: prospects,
  };
}

export type OutreachPaceInput = {
  settings: OutreachGoalSettings;
  progress: GoalProgress;
  rate: EffectiveRateResult;
};

export type OutreachPace = {
  recommendedDailySends: number;
  projectedAttainment: number;
  neededPerDay: number;
  rateSource: RateSource;
  effectiveRate: number;
  goalMet: boolean;
  monthEnded: boolean;
};

export function computeOutreachPace(input: OutreachPaceInput): OutreachPace {
  const { settings, progress, rate } = input;
  const goalMet = progress.remainingGoal === 0;
  const monthEnded = progress.remainingSellingDays === 0;

  if (goalMet) {
    return {
      recommendedDailySends: 0,
      projectedAttainment: progress.mtdAccounts,
      neededPerDay: 0,
      rateSource: rate.rateSource,
      effectiveRate: rate.effectiveRate,
      goalMet: true,
      monthEnded,
    };
  }

  const denomDays = progress.remainingSellingDays > 0 ? progress.remainingSellingDays : 1;
  const neededPerDay = progress.remainingGoal / denomDays;
  const effectiveRate = Math.max(rate.effectiveRate, 1e-9);
  const rawSends = Math.ceil(neededPerDay / effectiveRate);

  // Non-selling day → 0; otherwise clamp. Month-ended with remaining goal still uses capped raw.
  const recommendedDailySends = !progress.isSellingDay
    ? 0
    : clamp(rawSends, settings.paceFloor, settings.paceCap);

  const projectedAttainment = Math.min(
    settings.monthlyTarget,
    progress.mtdAccounts +
      progress.remainingSellingDays * rate.effectiveRate * (recommendedDailySends || rawSends),
  );

  return {
    recommendedDailySends,
    projectedAttainment: Math.round(projectedAttainment * 10) / 10,
    neededPerDay,
    rateSource: rate.rateSource,
    effectiveRate: rate.effectiveRate,
    goalMet: false,
    monthEnded,
  };
}

/** Convenience: progress + rate + pace together for Dashboard. */
export function computeOutreachGoalSnapshot(params: {
  settings: OutreachGoalSettings;
  mtdAccounts: number;
  attributedConversions: number;
  outreachProspects: number;
  asOf?: Date;
}): { progress: GoalProgress; rate: EffectiveRateResult; pace: OutreachPace } {
  const progress = computeGoalProgress({
    settings: params.settings,
    mtdAccounts: params.mtdAccounts,
    asOf: params.asOf,
  });
  const rate = computeEffectiveConversionRate({
    settings: params.settings,
    attributedConversions: params.attributedConversions,
    outreachProspects: params.outreachProspects,
  });
  const pace = computeOutreachPace({ settings: params.settings, progress, rate });
  return { progress, rate, pace };
}
