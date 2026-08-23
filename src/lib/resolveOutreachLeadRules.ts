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
import { refreshPersistedLeadRules } from '@/lib/refreshPersistedLeadRules';
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

function cachedLeadRulesFromSettings(settings: {
  leadRules: OutreachLeadRules | null;
  leadRulesSource: LeadRuleSource | null;
  leadRulesMeta: LeadRuleCalibrationMeta | null;
  leadRulesComputedAt: string | null;
}): ResolvedOutreachLeadRules | null {
  if (
    !settings.leadRules ||
    !settings.leadRulesSource ||
    !settings.leadRulesMeta ||
    !settings.leadRulesComputedAt
  ) {
    return null;
  }
  return {
    rules: settings.leadRules,
    source: settings.leadRulesSource,
    meta: settings.leadRulesMeta,
  };
}

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

  const cached = cachedLeadRulesFromSettings(goals.settings);
  if (cached) {
    return cached;
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

  const refreshed = await refreshPersistedLeadRules({ client, asOf, performance: report });
  if (refreshed.ok) {
    return refreshed.result;
  }

  return computeCalibratedLeadRules({
    report,
    cohort: report.attributionCohort,
    settings: goals.settings,
  });
}
