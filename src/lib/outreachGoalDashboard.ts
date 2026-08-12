/**
 * Load Dashboard primary KPI snapshot (MTD accounts, pace, performance).
 * Separates primary Active Account metrics from leading call/engagement indicators.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import {
  countMtdActiveAccountConversions,
  loadAttributionCohortStats,
} from '@/lib/outreachAttribution';
import { getOutreachGoalSettings, type OutreachGoalSettings } from '@/lib/outreachGoals';
import {
  computeOutreachGoalSnapshot,
  type GoalProgress,
  type OutreachPace,
  type EffectiveRateResult,
} from '@/lib/outreachPace';
import {
  loadOutreachPerformanceReport,
  type OutreachPerformanceReport,
} from '@/lib/outreachPerformance';
import { monthUtcBounds, monthWindowInTimezone, lookbackStartIso } from '@/lib/outreachSellingDays';
import { supabase } from '@/lib/supabase';

type Client = SupabaseClient<Database>;

export type OutreachGoalDashboardSnapshot = {
  settings: OutreachGoalSettings;
  progress: GoalProgress;
  rate: EffectiveRateResult;
  pace: OutreachPace;
  performance: OutreachPerformanceReport | null;
};

export async function loadOutreachGoalDashboardSnapshot(params?: {
  client?: Client;
  asOf?: Date;
}): Promise<{ ok: true; snapshot: OutreachGoalDashboardSnapshot } | { ok: false; error: string }> {
  const client = params?.client ?? supabase;
  const asOf = params?.asOf ?? new Date();

  const goals = await getOutreachGoalSettings(client);
  if (!goals.ok) return { ok: false, error: goals.error };

  const month = monthWindowInTimezone(asOf, goals.settings.businessTimezone);
  const bounds = monthUtcBounds(month, goals.settings.businessTimezone);
  const mtd = await countMtdActiveAccountConversions({
    client,
    monthStartIso: bounds.startIso,
    monthEndExclusiveIso: bounds.endExclusiveIso,
  });
  if (!mtd.ok) return { ok: false, error: mtd.error };

  const lookbackStart = lookbackStartIso(
    asOf,
    goals.settings.lookbackDays,
    goals.settings.businessTimezone,
  );
  const cohort = await loadAttributionCohortStats({
    client,
    lookbackStartIso: lookbackStart,
    asOfIso: asOf.toISOString(),
  });
  if (!cohort.ok) return { ok: false, error: cohort.error };

  const { progress, rate, pace } = computeOutreachGoalSnapshot({
    settings: goals.settings,
    mtdAccounts: mtd.count,
    attributedConversions: cohort.attributedConversions,
    outreachProspects: cohort.outreachProspects,
    asOf,
  });

  const perf = await loadOutreachPerformanceReport({ client, asOf });

  return {
    ok: true,
    snapshot: {
      settings: goals.settings,
      progress,
      rate,
      pace,
      performance: perf.ok ? perf.report : null,
    },
  };
}
