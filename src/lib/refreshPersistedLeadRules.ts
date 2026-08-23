/**
 * Persist calibrated lead rules on outreach_goal_settings (PR6).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { getOutreachGoalSettings, type OutreachGoalSettings } from '@/lib/outreachGoals';
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

const DEFAULT_GOAL_ROW_ID = '00000000-0000-4000-8000-000000000001';
const EMPTY_LINE_GOAL_ROW_ID = '00000000-0000-4000-8000-000000000002';

function isPersistedGoalRow(settings: OutreachGoalSettings): boolean {
  return settings.id !== DEFAULT_GOAL_ROW_ID && settings.id !== EMPTY_LINE_GOAL_ROW_ID;
}

export type RefreshPersistedLeadRulesResult = {
  rules: OutreachLeadRules;
  source: LeadRuleSource;
  meta: LeadRuleCalibrationMeta;
  persisted: boolean;
};

export async function refreshPersistedLeadRules(params: {
  client?: Client;
  asOf?: Date;
  performance?: OutreachPerformanceReport | null;
}): Promise<{ ok: true; result: RefreshPersistedLeadRulesResult } | { ok: false; error: string }> {
  const client = params.client ?? supabase;
  const asOf = params.asOf ?? new Date();

  const goals = await getOutreachGoalSettings(client);
  if (!goals.ok) return goals;

  let report = params.performance ?? null;
  if (report == null) {
    const loaded = await loadOutreachPerformanceReport({ client, asOf });
    if (!loaded.ok) return loaded;
    report = loaded.report;
  }

  const computed = computeCalibratedLeadRules({
    report,
    cohort: report.attributionCohort,
    settings: goals.settings,
  });

  if (!isPersistedGoalRow(goals.settings)) {
    return {
      ok: true,
      result: { ...computed, persisted: false },
    };
  }

  const { error } = await client
    .from('outreach_goal_settings')
    .update({
      lead_rules: computed.rules,
      lead_rules_source: computed.source,
      lead_rules_meta: computed.meta,
      lead_rules_computed_at: asOf.toISOString(),
    } as never)
    .eq('id', goals.settings.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    result: { ...computed, persisted: true },
  };
}
