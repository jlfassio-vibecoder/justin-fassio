/**
 * Resolve active lead rules from performance data (measured) or provisional defaults.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { getOutreachGoalSettings, defaultOutreachGoalSettings } from '@/lib/outreachGoals';
import {
  computeCalibratedLeadRules,
  type LeadRuleCalibrationMeta,
  type LeadRuleSource,
} from '@/lib/outreachLeadRuleCalibration';
import type { OutreachLeadRules } from '@/lib/outreachLeadRules';
import {
  loadOutreachPerformanceReport,
  type OutreachPerformanceReport,
} from '@/lib/outreachPerformance';
import { supabase } from '@/lib/supabase';

type Client = SupabaseClient<Database>;

export type ResolvedOutreachLeadRules = {
  rules: OutreachLeadRules;
  source: LeadRuleSource;
  meta: LeadRuleCalibrationMeta;
};

export async function resolveOutreachLeadRules(params: {
  client?: Client;
  asOf?: Date;
  performance?: OutreachPerformanceReport | null;
}): Promise<ResolvedOutreachLeadRules> {
  const client = params.client ?? supabase;
  const asOf = params.asOf ?? new Date();

  const goals = await getOutreachGoalSettings(client);
  if (!goals.ok) {
    return computeCalibratedLeadRules({
      report: null,
      cohort: { rows: [] },
      settings: defaultOutreachGoalSettings(),
    });
  }

  let report = params.performance ?? null;
  if (report == null) {
    const loaded = await loadOutreachPerformanceReport({ client, asOf });
    if (!loaded.ok) {
      return computeCalibratedLeadRules({
        report: null,
        cohort: { rows: [] },
        settings: goals.settings,
      });
    }
    report = loaded.report;
  }

  return computeCalibratedLeadRules({
    report,
    cohort: report.attributionCohort,
    settings: goals.settings,
  });
}
