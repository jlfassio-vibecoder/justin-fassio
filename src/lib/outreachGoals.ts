/**
 * Phase 4 outreach goal settings (singleton).
 * Default monthly target = 5; planning conversion = 1.5%.
 * Not stored in catalog_settings.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Database,
  OutreachGoalSettingsRow,
  OutreachGoalSettingsUpdate,
  SellingDayMode,
} from '@/types/database';
import { supabase } from '@/lib/supabase';

type Client = SupabaseClient<Database>;

export const OUTREACH_GOAL_DEFAULTS = {
  monthlyTarget: 5,
  planningConversionRate: 0.015,
  minAttributedConversions: 8,
  lookbackDays: 90,
  lastTouchWindowDays: 45,
  smoothingAlpha: 0.3,
  measuredRateFloor: 0.005,
  measuredRateCap: 0.06,
  paceFloor: 1,
  paceCap: 25,
  businessTimezone: 'America/Vancouver',
  sellingDayMode: 'weekdays' as SellingDayMode,
} as const;

export type OutreachGoalSettings = {
  id: string;
  monthlyTarget: number;
  planningConversionRate: number;
  minAttributedConversions: number;
  lookbackDays: number;
  lastTouchWindowDays: number;
  smoothingAlpha: number;
  measuredRateFloor: number;
  measuredRateCap: number;
  paceFloor: number;
  paceCap: number;
  businessTimezone: string;
  sellingDayMode: SellingDayMode;
  updatedAt: string;
  updatedBy: string | null;
};

export function mapOutreachGoalSettingsRow(row: OutreachGoalSettingsRow): OutreachGoalSettings {
  return {
    id: row.id,
    monthlyTarget: row.monthly_target,
    planningConversionRate: Number(row.planning_conversion_rate),
    minAttributedConversions: row.min_attributed_conversions,
    lookbackDays: row.lookback_days,
    lastTouchWindowDays: row.last_touch_window_days,
    smoothingAlpha: Number(row.smoothing_alpha),
    measuredRateFloor: Number(row.measured_rate_floor),
    measuredRateCap: Number(row.measured_rate_cap),
    paceFloor: row.pace_floor,
    paceCap: row.pace_cap,
    businessTimezone: row.business_timezone,
    sellingDayMode: row.selling_day_mode,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/** In-memory defaults when DB row is missing (tests / pre-migration). */
export function defaultOutreachGoalSettings(): OutreachGoalSettings {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    monthlyTarget: OUTREACH_GOAL_DEFAULTS.monthlyTarget,
    planningConversionRate: OUTREACH_GOAL_DEFAULTS.planningConversionRate,
    minAttributedConversions: OUTREACH_GOAL_DEFAULTS.minAttributedConversions,
    lookbackDays: OUTREACH_GOAL_DEFAULTS.lookbackDays,
    lastTouchWindowDays: OUTREACH_GOAL_DEFAULTS.lastTouchWindowDays,
    smoothingAlpha: OUTREACH_GOAL_DEFAULTS.smoothingAlpha,
    measuredRateFloor: OUTREACH_GOAL_DEFAULTS.measuredRateFloor,
    measuredRateCap: OUTREACH_GOAL_DEFAULTS.measuredRateCap,
    paceFloor: OUTREACH_GOAL_DEFAULTS.paceFloor,
    paceCap: OUTREACH_GOAL_DEFAULTS.paceCap,
    businessTimezone: OUTREACH_GOAL_DEFAULTS.businessTimezone,
    sellingDayMode: OUTREACH_GOAL_DEFAULTS.sellingDayMode,
    updatedAt: new Date(0).toISOString(),
    updatedBy: null,
  };
}

export async function getOutreachGoalSettings(
  client: Client = supabase,
): Promise<{ ok: true; settings: OutreachGoalSettings } | { ok: false; error: string }> {
  const { data, error } = await client
    .from('outreach_goal_settings')
    .select('*')
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, settings: defaultOutreachGoalSettings() };
  return { ok: true, settings: mapOutreachGoalSettingsRow(data) };
}

export type UpdateOutreachGoalSettingsInput = {
  monthlyTarget?: number;
  planningConversionRate?: number;
  businessTimezone?: string;
  updatedBy?: string | null;
};

export async function updateOutreachGoalSettings(
  input: UpdateOutreachGoalSettingsInput,
  client: Client = supabase,
): Promise<{ ok: true; settings: OutreachGoalSettings } | { ok: false; error: string }> {
  const current = await getOutreachGoalSettings(client);
  if (!current.ok) return current;

  const patch: OutreachGoalSettingsUpdate = {};
  if (input.monthlyTarget != null) {
    if (!Number.isFinite(input.monthlyTarget) || input.monthlyTarget < 0) {
      return { ok: false, error: 'monthlyTarget must be a non-negative number' };
    }
    patch.monthly_target = Math.floor(input.monthlyTarget);
  }
  if (input.planningConversionRate != null) {
    if (
      !Number.isFinite(input.planningConversionRate) ||
      input.planningConversionRate <= 0 ||
      input.planningConversionRate > 1
    ) {
      return { ok: false, error: 'planningConversionRate must be between 0 and 1 exclusive of 0' };
    }
    patch.planning_conversion_rate = input.planningConversionRate;
  }
  if (input.businessTimezone != null) {
    if (!input.businessTimezone.trim()) {
      return { ok: false, error: 'businessTimezone is required' };
    }
    patch.business_timezone = input.businessTimezone.trim();
  }
  if (input.updatedBy !== undefined) {
    patch.updated_by = input.updatedBy;
  }

  if (Object.keys(patch).length === 0) {
    return current;
  }

  const { data, error } = await client
    .from('outreach_goal_settings')
    .update(patch)
    .eq('id', current.settings.id)
    .select('*')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    // Seed missing row then update
    const { data: inserted, error: insertErr } = await client
      .from('outreach_goal_settings')
      .insert({
        monthly_target: patch.monthly_target ?? OUTREACH_GOAL_DEFAULTS.monthlyTarget,
        planning_conversion_rate:
          patch.planning_conversion_rate ?? OUTREACH_GOAL_DEFAULTS.planningConversionRate,
        business_timezone: patch.business_timezone ?? OUTREACH_GOAL_DEFAULTS.businessTimezone,
        updated_by: patch.updated_by ?? null,
      })
      .select('*')
      .maybeSingle();
    if (insertErr || !inserted) {
      return { ok: false, error: insertErr?.message ?? 'Failed to create goal settings' };
    }
    return { ok: true, settings: mapOutreachGoalSettingsRow(inserted) };
  }

  return { ok: true, settings: mapOutreachGoalSettingsRow(data) };
}
