/**
 * Phase 4 outreach goal settings.
 * Flag off: singleton (backfilled OGR row). Flag on: per-line; missing EP/BF → empty/zero.
 * Prep/send/cron keep calling getOutreachGoalSettings(client) with no line id.
 * Not stored in catalog_settings.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Database,
  OutreachGoalSettingsRow,
  OutreachGoalSettingsUpdate,
  SellingDayMode,
} from '@/types/database';
import { isMultiLineWritesEnabled } from '@/lib/staffFeatures';
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

const DEFAULT_GOAL_ROW_ID = '00000000-0000-4000-8000-000000000001';
const EMPTY_LINE_GOAL_ROW_ID = '00000000-0000-4000-8000-000000000002';

/** In-memory defaults when DB row is missing (tests / pre-migration / OGR fallback). */
export function defaultOutreachGoalSettings(): OutreachGoalSettings {
  return {
    id: DEFAULT_GOAL_ROW_ID,
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

/** Empty/zero KPIs when writes are on and the line has no goal row (EP/BF). */
export function emptyLineOutreachGoalSettings(): OutreachGoalSettings {
  return {
    ...defaultOutreachGoalSettings(),
    id: EMPTY_LINE_GOAL_ROW_ID,
    monthlyTarget: 0,
  };
}

function isUnpersistedGoalSettings(settings: OutreachGoalSettings): boolean {
  return settings.id === DEFAULT_GOAL_ROW_ID || settings.id === EMPTY_LINE_GOAL_ROW_ID;
}

export type OutreachGoalQueryOptions = {
  writesEnabled?: boolean;
  salesLineId?: string | null;
};

async function resolveOgrSalesLineId(
  client: Client,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await client.from('lines').select('id').eq('code', 'ogr').maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'OGR sales line not found' };
  return { ok: true, id: data.id };
}

export async function getOutreachGoalSettings(
  client: Client = supabase,
  options?: OutreachGoalQueryOptions,
): Promise<{ ok: true; settings: OutreachGoalSettings } | { ok: false; error: string }> {
  const writesOn = options?.writesEnabled ?? isMultiLineWritesEnabled();
  const salesLineId = options?.salesLineId?.trim() || null;

  if (!writesOn) {
    const { data, error } = await client
      .from('outreach_goal_settings')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: true, settings: defaultOutreachGoalSettings() };
    return { ok: true, settings: mapOutreachGoalSettingsRow(data) };
  }

  let lineId = salesLineId;
  if (!lineId) {
    const ogr = await resolveOgrSalesLineId(client);
    if (!ogr.ok) return ogr;
    lineId = ogr.id;
  }

  const { data, error } = await client
    .from('outreach_goal_settings')
    .select('*')
    .eq('sales_line_id', lineId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (data) return { ok: true, settings: mapOutreachGoalSettingsRow(data) };

  if (!salesLineId) {
    return { ok: true, settings: defaultOutreachGoalSettings() };
  }

  const { data: line, error: lineError } = await client
    .from('lines')
    .select('code')
    .eq('id', salesLineId)
    .maybeSingle();
  if (lineError) return { ok: false, error: lineError.message };
  if (line?.code && line.code !== 'ogr') {
    return { ok: true, settings: emptyLineOutreachGoalSettings() };
  }
  return { ok: true, settings: defaultOutreachGoalSettings() };
}

export type UpdateOutreachGoalSettingsInput = {
  monthlyTarget?: number;
  planningConversionRate?: number;
  businessTimezone?: string;
  updatedBy?: string | null;
  writesEnabled?: boolean;
  salesLineId?: string | null;
};

export async function updateOutreachGoalSettings(
  input: UpdateOutreachGoalSettingsInput,
  client: Client = supabase,
): Promise<{ ok: true; settings: OutreachGoalSettings } | { ok: false; error: string }> {
  const queryOpts: OutreachGoalQueryOptions = {
    writesEnabled: input.writesEnabled,
    salesLineId: input.salesLineId,
  };
  const current = await getOutreachGoalSettings(client, queryOpts);
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

  const persistLine = async (): Promise<
    { ok: true; id: string } | { ok: false; error: string }
  > => {
    const requested = input.salesLineId?.trim() || null;
    if (requested) return { ok: true, id: requested };
    return resolveOgrSalesLineId(client);
  };

  if (!isUnpersistedGoalSettings(current.settings)) {
    const { data, error } = await client
      .from('outreach_goal_settings')
      .update(patch)
      .eq('id', current.settings.id)
      .select('*')
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (data) return { ok: true, settings: mapOutreachGoalSettingsRow(data) };
  }

  const line = await persistLine();
  if (!line.ok) return line;

  const { data: inserted, error: insertErr } = await client
    .from('outreach_goal_settings')
    .insert({
      sales_line_id: line.id,
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
