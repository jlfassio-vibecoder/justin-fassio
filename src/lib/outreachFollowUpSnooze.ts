import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { formatOutreachPreparationDate } from '@/lib/outreachSelectTargets';
import { AGENT_OUTREACH_PREP_TZ } from '@/lib/outreachSelectionConstants';

type Client = SupabaseClient<Database>;

function addDaysYmd(ymd: string, days: number): string {
  const ms = Date.parse(`${ymd}T12:00:00.000Z`);
  const next = new Date(ms + days * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

/** Prospect ids snoozed through today or later (Vancouver). */
export async function loadActiveFollowUpSnoozes(
  client: Client,
  options?: { asOf?: Date; prospectIds?: number[] },
): Promise<Set<number>> {
  const today = formatOutreachPreparationDate(options?.asOf ?? new Date(), AGENT_OUTREACH_PREP_TZ);
  let query = client
    .from('outreach_follow_up_snoozes')
    .select('prospect_id, snoozed_until')
    .gte('snoozed_until', today);

  if (options?.prospectIds?.length) {
    query = query.in('prospect_id', options.prospectIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const snoozed = new Set<number>();
  for (const row of data ?? []) {
    if (typeof row.prospect_id === 'number' && Number.isFinite(row.prospect_id)) {
      snoozed.add(row.prospect_id);
    }
  }
  return snoozed;
}

export async function snoozeFollowUpUntilTomorrow(
  client: Client,
  prospectId: number,
  options?: { asOf?: Date },
): Promise<{ ok: true; snoozedUntil: string } | { ok: false; error: string }> {
  if (!Number.isFinite(prospectId) || prospectId <= 0) {
    return { ok: false, error: 'prospectId is required' };
  }
  const today = formatOutreachPreparationDate(options?.asOf ?? new Date(), AGENT_OUTREACH_PREP_TZ);
  const snoozedUntil = addDaysYmd(today, 1);

  const { error } = await client.from('outreach_follow_up_snoozes').upsert(
    {
      prospect_id: prospectId,
      snoozed_until: snoozedUntil,
    },
    { onConflict: 'prospect_id' },
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true, snoozedUntil };
}
