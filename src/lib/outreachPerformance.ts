/**
 * Phase 4 performance slices — learning inputs for channel allocation weights and reporting.
 * Unattributed converts are excluded from learned numerators.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { getOutreachGoalSettings } from '@/lib/outreachGoals';
import { lookbackStartIso } from '@/lib/outreachSellingDays';
import { primaryRetailChannelLabel } from '@/lib/crmRetailTaxonomy';
import { supabase } from '@/lib/supabase';

type Client = SupabaseClient<Database>;

export type PerformanceSlice = {
  key: string;
  label: string;
  sends: number;
  attributedConversions: number;
  conversionRate: number | null;
  confidence: 'insufficient' | 'measured';
};

export type OutreachPerformanceReport = {
  lookbackDays: number;
  minAttributedConversions: number;
  byChannel: PerformanceSlice[];
  byProduct: PerformanceSlice[];
  byFitBand: PerformanceSlice[];
  byLeadState: PerformanceSlice[];
};

export function fitBandKey(fitScore: number | null | undefined): string {
  if (fitScore == null || !Number.isFinite(fitScore)) return 'unknown';
  if (fitScore >= 8) return '8-10';
  if (fitScore >= 6) return '6-7';
  if (fitScore >= 1) return '1-5';
  return 'unknown';
}

function sliceFromMap(
  map: Map<string, { sends: number; conversions: number }>,
  labelFor: (key: string) => string,
  minAttributed: number,
): PerformanceSlice[] {
  return [...map.entries()]
    .map(([key, v]) => {
      const rate = v.sends > 0 ? v.conversions / v.sends : null;
      return {
        key,
        label: labelFor(key),
        sends: v.sends,
        attributedConversions: v.conversions,
        conversionRate: rate,
        confidence:
          v.conversions >= minAttributed && v.sends > 0
            ? ('measured' as const)
            : ('insufficient' as const),
      };
    })
    .sort((a, b) => b.attributedConversions - a.attributedConversions || b.sends - a.sends);
}

function bump(
  map: Map<string, { sends: number; conversions: number }>,
  key: string,
  field: 'sends' | 'conversions',
  n = 1,
) {
  const cur = map.get(key) ?? { sends: 0, conversions: 0 };
  cur[field] += n;
  map.set(key, cur);
}

/** Pure builder for tests — pass pre-loaded rows. */
export function buildOutreachPerformanceReport(params: {
  lookbackDays: number;
  minAttributedConversions: number;
  attributedRows: Array<{
    attribution_model: string;
    attributed_system_message_id: string | null;
    primary_channel: string | null;
    catalog_item_id: string | null;
    fit_score: number | null;
    lead_state: string | null;
    snapshot?: unknown;
  }>;
  sendRows: Array<{
    catalog_item_id: string | null;
    primary_channel: string | null;
    fit_score: number | null;
  }>;
}): OutreachPerformanceReport {
  const byChannel = new Map<string, { sends: number; conversions: number }>();
  const byProduct = new Map<string, { sends: number; conversions: number }>();
  const byFitBand = new Map<string, { sends: number; conversions: number }>();
  const byLeadState = new Map<string, { sends: number; conversions: number }>();

  for (const s of params.sendRows) {
    bump(byChannel, s.primary_channel ?? 'unknown', 'sends');
    bump(byProduct, s.catalog_item_id ?? 'unknown', 'sends');
    bump(byFitBand, fitBandKey(s.fit_score), 'sends');
  }

  for (const row of params.attributedRows) {
    const linked =
      (row.attribution_model === 'staff_confirmed' ||
        row.attribution_model === 'last_touch_inferred') &&
      row.attributed_system_message_id != null;
    if (!linked) continue;

    bump(byChannel, row.primary_channel ?? 'unknown', 'conversions');
    bump(byProduct, row.catalog_item_id ?? 'unknown', 'conversions');
    bump(byFitBand, fitBandKey(row.fit_score), 'conversions');
    bump(byLeadState, row.lead_state ?? 'unknown', 'conversions');
  }

  // Lead-state sends are not tracked at send time — only conversion numerators.
  // Use conversion-only keys for lead state table (sends stay 0).
  const min = params.minAttributedConversions;

  return {
    lookbackDays: params.lookbackDays,
    minAttributedConversions: min,
    byChannel: sliceFromMap(
      byChannel,
      (k) => {
        if (k === 'unknown') return 'Unknown';
        try {
          return primaryRetailChannelLabel(k as never) || k;
        } catch {
          return k;
        }
      },
      min,
    ),
    byProduct: sliceFromMap(byProduct, (k) => (k === 'unknown' ? 'Unknown product' : k), min),
    byFitBand: sliceFromMap(byFitBand, (k) => (k === 'unknown' ? 'Unknown fit' : `Fit ${k}`), min),
    byLeadState: sliceFromMap(
      byLeadState,
      (k) => (k === 'unknown' ? 'Unknown' : k.charAt(0).toUpperCase() + k.slice(1)),
      min,
    ),
  };
}

export async function loadOutreachPerformanceReport(params?: {
  client?: Client;
  asOf?: Date;
}): Promise<{ ok: true; report: OutreachPerformanceReport } | { ok: false; error: string }> {
  const client = params?.client ?? supabase;
  const asOf = params?.asOf ?? new Date();
  const goals = await getOutreachGoalSettings(client);
  if (!goals.ok) return { ok: false, error: goals.error };

  const startIso = lookbackStartIso(
    asOf,
    goals.settings.lookbackDays,
    goals.settings.businessTimezone,
  );
  const asOfIso = asOf.toISOString();

  const { data: attrs, error: attrErr } = await client
    .from('account_conversion_attribution')
    .select(
      'attribution_model, attributed_system_message_id, primary_channel, catalog_item_id, fit_score, lead_state, snapshot',
    )
    .gte('converted_at', startIso)
    .lte('converted_at', asOfIso);
  if (attrErr) return { ok: false, error: attrErr.message };

  const { data: sends, error: sendErr } = await client
    .from('system_messages')
    .select('id, catalog_item_id, prospect_id, payload, sent_at')
    .eq('message_type', 'product_outreach')
    .not('sent_at', 'is', null)
    .gte('sent_at', startIso)
    .lte('sent_at', asOfIso);
  if (sendErr) return { ok: false, error: sendErr.message };

  const prospectIds = [
    ...new Set(
      (sends ?? []).map((s) => s.prospect_id).filter((id): id is number => typeof id === 'number'),
    ),
  ];
  const prospectMeta = new Map<number, { category: string | null; fit_score: number | null }>();
  if (prospectIds.length > 0) {
    const { data: prospects } = await client
      .from('prospects')
      .select('id, category, fit_score')
      .in('id', prospectIds);
    for (const p of prospects ?? []) {
      prospectMeta.set(p.id, {
        category: p.category,
        fit_score: p.fit_score != null ? Number(p.fit_score) : null,
      });
    }
  }

  const sendRows = (sends ?? []).map((s) => {
    const payload =
      s.payload && typeof s.payload === 'object' && !Array.isArray(s.payload)
        ? (s.payload as Record<string, unknown>)
        : {};
    const gen =
      payload.generation && typeof payload.generation === 'object'
        ? (payload.generation as Record<string, unknown>)
        : null;
    const primaryFromGen = typeof gen?.primaryChannel === 'string' ? gen.primaryChannel : null;
    const meta = typeof s.prospect_id === 'number' ? prospectMeta.get(s.prospect_id) : undefined;
    return {
      catalog_item_id: s.catalog_item_id,
      primary_channel: primaryFromGen ?? meta?.category ?? null,
      fit_score: meta?.fit_score ?? null,
    };
  });

  const report = buildOutreachPerformanceReport({
    lookbackDays: goals.settings.lookbackDays,
    minAttributedConversions: goals.settings.minAttributedConversions,
    attributedRows: attrs ?? [],
    sendRows,
  });

  return { ok: true, report };
}
