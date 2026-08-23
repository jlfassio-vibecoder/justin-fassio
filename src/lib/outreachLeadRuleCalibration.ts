/**
 * Derive measured lead rules from Phase 4 byLeadState performance and attribution cohort.
 * Falls back to provisional rules when data is insufficient.
 */

import type { OutreachGoalSettings } from '@/lib/outreachGoals';
import {
  OUTREACH_LEAD_RULES,
  OUTREACH_LEAD_RULES_MEASURED_VERSION,
  type OutreachLeadRules,
} from '@/lib/outreachLeadRules';
import { evaluateLeadState } from '@/lib/outreachLeadState';
import type {
  LeadRuleCalibrationCohort,
  OutreachPerformanceReport,
} from '@/lib/outreachPerformance';
import { MIN_LEAD_STATE_SENDS } from '@/lib/outreachSelectionConstants';

export type LeadRuleSource = 'provisional' | 'measured';

export type LeadRuleCalibrationMeta = {
  globalRate: number;
  byState: Record<string, { sends: number; conversions: number; blendedRate: number }>;
  adjustedFields: string[];
};

export type LeadRuleCalibrationResult = {
  rules: OutreachLeadRules;
  source: LeadRuleSource;
  meta: LeadRuleCalibrationMeta;
};

function clampInt(value: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, value)));
}

function clampWeight(base: number, next: number): number {
  const min = Math.max(1, Math.round(base * 0.6));
  const max = Math.max(min, Math.round(base * 1.4));
  return clampInt(next, min, max);
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx] ?? null;
}

function sliceMap(
  report: OutreachPerformanceReport,
): Map<string, { sends: number; conversions: number }> {
  const map = new Map<string, { sends: number; conversions: number }>();
  for (const row of report.byLeadState) {
    map.set(row.key, { sends: row.sends, conversions: row.attributedConversions });
  }
  return map;
}

function blendedStateRates(input: {
  report: OutreachPerformanceReport;
  settings: OutreachGoalSettings;
  globalRate: number;
}): LeadRuleCalibrationMeta['byState'] {
  const byState = sliceMap(input.report);
  const alpha = input.settings.smoothingAlpha;
  const floor = input.settings.measuredRateFloor;
  const out: LeadRuleCalibrationMeta['byState'] = {};

  for (const state of ['cold', 'warm', 'hot'] as const) {
    const slice = byState.get(state) ?? { sends: 0, conversions: 0 };
    let blendedRate = input.globalRate;
    if (slice.sends >= MIN_LEAD_STATE_SENDS) {
      const rawRate = slice.conversions / slice.sends;
      blendedRate = alpha * rawRate + (1 - alpha) * input.globalRate;
    }
    out[state] = {
      sends: slice.sends,
      conversions: slice.conversions,
      blendedRate: Math.max(blendedRate, floor),
    };
  }

  return out;
}

function adjustThresholds(
  base: OutreachLeadRules,
  cohort: LeadRuleCalibrationCohort,
  byState: LeadRuleCalibrationMeta['byState'],
  adjustedFields: string[],
): Pick<OutreachLeadRules, 'warmScoreMin' | 'hotScoreMin'> {
  const hotScores = cohort.rows
    .filter((row) => row.leadState === 'hot' && row.leadScore != null)
    .map((row) => row.leadScore as number);
  const warmScores = cohort.rows
    .filter((row) => row.leadState === 'warm' && row.leadScore != null)
    .map((row) => row.leadScore as number);

  let warmScoreMin = base.warmScoreMin;
  let hotScoreMin = base.hotScoreMin;

  const warmP25 = percentile(warmScores, 25);
  if (warmP25 != null) {
    warmScoreMin = clampInt(warmP25, base.warmScoreMin - 2, base.warmScoreMin + 2);
    adjustedFields.push('warmScoreMin');
  }

  const hotP25 = percentile(hotScores, 25);
  if (hotP25 != null) {
    hotScoreMin = clampInt(hotP25, base.hotScoreMin - 2, base.hotScoreMin + 2);
    adjustedFields.push('hotScoreMin');
  }

  const hotRate = byState.hot?.blendedRate ?? 0;
  const warmRate = byState.warm?.blendedRate ?? 0;
  if (hotRate > 0 && warmRate > 0 && hotRate < warmRate) {
    hotScoreMin = clampInt(hotScoreMin + 1, base.hotScoreMin - 2, base.hotScoreMin + 2);
    if (!adjustedFields.includes('hotScoreMin')) adjustedFields.push('hotScoreMin');
  }

  if (warmScoreMin >= hotScoreMin) {
    warmScoreMin = Math.max(base.warmScoreMin - 2, hotScoreMin - 1);
  }

  return { warmScoreMin, hotScoreMin };
}

function adjustPointWeights(
  base: OutreachLeadRules,
  cohort: LeadRuleCalibrationCohort,
  adjustedFields: string[],
): Pick<
  OutreachLeadRules,
  | 'pointsOpenOnlyProduct'
  | 'openOnlyProductCap'
  | 'pointsClickedProduct'
  | 'pointsRepeatClick'
  | 'pointsHeavyRepeatClick'
  | 'pointsMultiProductClick'
  | 'pointsAttributedReply'
> {
  const rows = cohort.rows;
  if (rows.length === 0) {
    return {
      pointsOpenOnlyProduct: base.pointsOpenOnlyProduct,
      openOnlyProductCap: base.openOnlyProductCap,
      pointsClickedProduct: base.pointsClickedProduct,
      pointsRepeatClick: base.pointsRepeatClick,
      pointsHeavyRepeatClick: base.pointsHeavyRepeatClick,
      pointsMultiProductClick: base.pointsMultiProductClick,
      pointsAttributedReply: base.pointsAttributedReply,
    };
  }

  const withClick = rows.filter((row) => row.engagement.clickCount >= 1).length;
  const openOnly = rows.filter(
    (row) => row.engagement.openCount > 0 && row.engagement.clickCount === 0,
  ).length;
  const withReply = rows.filter((row) => row.engagement.replyAttributed).length;
  const withRepeat = rows.filter((row) => row.engagement.clickCount >= 2).length;
  const withMulti = rows.filter(
    (row) => row.engagement.clickCount > 0 && row.engagement.emailsSent >= 2,
  ).length;

  const total = rows.length;
  const clickShare = withClick / total;
  const openShare = openOnly / total;
  const replyShare = withReply / total;
  const repeatShare = withRepeat / total;
  const multiShare = withMulti / total;

  let pointsClickedProduct = base.pointsClickedProduct;

  if (openShare > 0) {
    const targetRatio = Math.max(3, clickShare / openShare);
    pointsClickedProduct = clampWeight(
      base.pointsClickedProduct,
      Math.round(base.pointsOpenOnlyProduct * targetRatio),
    );
    adjustedFields.push('pointsClickedProduct');
  } else if (clickShare > 0.5) {
    pointsClickedProduct = clampWeight(base.pointsClickedProduct, base.pointsClickedProduct + 1);
    adjustedFields.push('pointsClickedProduct');
  }

  if (openShare < 0.15 && base.openOnlyProductCap > 1) {
    adjustedFields.push('openOnlyProductCap');
  }
  const openOnlyProductCap =
    openShare < 0.15 ? Math.max(1, base.openOnlyProductCap - 1) : base.openOnlyProductCap;

  const pointsOpenOnlyProduct = clampWeight(
    base.pointsOpenOnlyProduct,
    Math.max(1, Math.round(base.pointsOpenOnlyProduct * (openShare + 0.5))),
  );
  if (pointsOpenOnlyProduct !== base.pointsOpenOnlyProduct) {
    adjustedFields.push('pointsOpenOnlyProduct');
  }

  if (pointsClickedProduct < pointsOpenOnlyProduct * 3) {
    pointsClickedProduct = pointsOpenOnlyProduct * 3;
  }

  const pointsRepeatClick = clampWeight(
    base.pointsRepeatClick,
    Math.round(base.pointsRepeatClick * (repeatShare + 0.5)),
  );
  if (pointsRepeatClick !== base.pointsRepeatClick) adjustedFields.push('pointsRepeatClick');

  const pointsHeavyRepeatClick = clampWeight(
    base.pointsHeavyRepeatClick,
    Math.round(base.pointsHeavyRepeatClick * (repeatShare + 0.4)),
  );
  if (pointsHeavyRepeatClick !== base.pointsHeavyRepeatClick) {
    adjustedFields.push('pointsHeavyRepeatClick');
  }

  const pointsMultiProductClick = clampWeight(
    base.pointsMultiProductClick,
    Math.round(base.pointsMultiProductClick * (multiShare + 0.5)),
  );
  if (pointsMultiProductClick !== base.pointsMultiProductClick) {
    adjustedFields.push('pointsMultiProductClick');
  }

  const pointsAttributedReply = clampWeight(
    base.pointsAttributedReply,
    Math.round(base.pointsAttributedReply * (replyShare + 0.5)),
  );
  if (pointsAttributedReply !== base.pointsAttributedReply) {
    adjustedFields.push('pointsAttributedReply');
  }

  return {
    pointsOpenOnlyProduct,
    openOnlyProductCap,
    pointsClickedProduct,
    pointsRepeatClick,
    pointsHeavyRepeatClick,
    pointsMultiProductClick,
    pointsAttributedReply,
  };
}

function adjustWindows(
  base: OutreachLeadRules,
  cohort: LeadRuleCalibrationCohort,
  adjustedFields: string[],
): Pick<
  OutreachLeadRules,
  'hotWindowDays' | 'warmWindowDays' | 'agedOutDays' | 'replyCallTodayDays'
> {
  const recency = cohort.rows
    .map((row) => row.recencyDays)
    .filter((value): value is number => value != null && Number.isFinite(value));

  if (recency.length < 3) {
    return {
      hotWindowDays: base.hotWindowDays,
      warmWindowDays: base.warmWindowDays,
      agedOutDays: base.agedOutDays,
      replyCallTodayDays: base.replyCallTodayDays,
    };
  }

  const median = percentile(recency, 50) ?? base.hotWindowDays;
  const hotWindowDays = clampInt(median, base.hotWindowDays - 3, base.hotWindowDays + 3);
  let warmWindowDays = clampInt(
    Math.max(hotWindowDays, median + 3),
    base.warmWindowDays - 3,
    base.warmWindowDays + 3,
  );
  let agedOutDays = clampInt(
    Math.max(warmWindowDays + 3, base.agedOutDays),
    base.agedOutDays - 3,
    base.agedOutDays + 3,
  );

  if (hotWindowDays !== base.hotWindowDays) adjustedFields.push('hotWindowDays');
  if (warmWindowDays !== base.warmWindowDays) adjustedFields.push('warmWindowDays');
  if (agedOutDays !== base.agedOutDays) adjustedFields.push('agedOutDays');

  if (hotWindowDays > warmWindowDays) warmWindowDays = hotWindowDays;
  if (warmWindowDays > agedOutDays) agedOutDays = warmWindowDays + 1;

  const replyCallTodayDays = base.replyCallTodayDays;

  return { hotWindowDays, warmWindowDays, agedOutDays, replyCallTodayDays };
}

function provisionalResult(base: OutreachLeadRules): LeadRuleCalibrationResult {
  return {
    rules: base,
    source: 'provisional',
    meta: { globalRate: 0, byState: {}, adjustedFields: [] },
  };
}

const CALIBRATED_LEAD_STATE_KEYS = new Set(['cold', 'warm', 'hot']);

function canonicalLeadStateTotals(report: OutreachPerformanceReport): {
  totalAttributed: number;
  totalSends: number;
} {
  let totalAttributed = 0;
  let totalSends = 0;
  for (const row of report.byLeadState) {
    if (!CALIBRATED_LEAD_STATE_KEYS.has(row.key)) continue;
    totalAttributed += row.attributedConversions;
    totalSends += row.sends;
  }
  return { totalAttributed, totalSends };
}

/**
 * Compute calibrated lead rules when attribution data is sufficient.
 */
export function computeCalibratedLeadRules(input: {
  report: OutreachPerformanceReport | null;
  cohort: LeadRuleCalibrationCohort;
  settings: OutreachGoalSettings;
  baseRules?: OutreachLeadRules;
}): LeadRuleCalibrationResult {
  const base = input.baseRules ?? OUTREACH_LEAD_RULES;
  const report = input.report;
  if (!report) return provisionalResult(base);

  const { totalAttributed, totalSends } = canonicalLeadStateTotals(report);

  if (totalAttributed < input.settings.minAttributedConversions || totalSends <= 0) {
    return provisionalResult(base);
  }

  const globalRate = totalAttributed / totalSends;
  const byState = blendedStateRates({ report, settings: input.settings, globalRate });
  const adjustedFields: string[] = [];

  const thresholds = adjustThresholds(base, input.cohort, byState, adjustedFields);
  const pointWeights = adjustPointWeights(base, input.cohort, adjustedFields);
  const windows = adjustWindows(base, input.cohort, adjustedFields);

  const rules: OutreachLeadRules = {
    version: OUTREACH_LEAD_RULES_MEASURED_VERSION,
    ...pointWeights,
    ...windows,
    ...thresholds,
  };

  return {
    rules,
    source: 'measured',
    meta: {
      globalRate,
      byState,
      adjustedFields: [...new Set(adjustedFields)],
    },
  };
}

/** Guardrail: opens-only engagement must not become Hot under calibrated rules. */
export function opensOnlyCannotBecomeHot(rules: OutreachLeadRules): boolean {
  const engagement = {
    prospectId: 1,
    emailsSent: 2,
    lastSentAt: '2026-08-20T12:00:00Z',
    openCount: 4,
    clickCount: 0,
    messagesOpened: 2,
    messagesClicked: 0,
    distinctProductsOpened: 4,
    distinctProductsClicked: 0,
    maxClickCountOnMessage: 0,
    lastOpenedAt: '2026-08-20T12:00:00Z',
    lastClickedAt: null,
    lastEngagementAt: '2026-08-20T12:00:00Z',
    suppressed: false,
    reply: { attributed: false, confidence: 'none' as const, lastMessageAt: null },
    unlinkedManualIncluded: 0,
  };

  const result = evaluateLeadState({
    engagement,
    asOf: new Date('2026-08-21T12:00:00Z'),
    rules,
  });
  return result.leadState !== 'hot';
}
