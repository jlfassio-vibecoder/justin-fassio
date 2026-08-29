/**
 * Staff dismiss for Briefing research-email queue (no findable contact email).
 * Dismissed prospects stay out of needsEmail selection until they have a usable email.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

type Client = SupabaseClient<Database>;

/** Prospect ids dismissed from the research-email queue. */
export async function loadResearchQueueDismissals(
  client: Client,
  options?: { prospectIds?: number[] },
): Promise<Set<number>> {
  let query = client.from('outreach_research_queue_dismissals').select('prospect_id');

  if (options?.prospectIds?.length) {
    query = query.in('prospect_id', options.prospectIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const dismissed = new Set<number>();
  for (const row of data ?? []) {
    if (typeof row.prospect_id === 'number' && Number.isFinite(row.prospect_id)) {
      dismissed.add(row.prospect_id);
    }
  }
  return dismissed;
}

export async function dismissResearchQueueProspect(
  client: Client,
  prospectId: number,
  options?: { dismissedBy?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(prospectId) || prospectId <= 0) {
    return { ok: false, error: 'prospectId is required' };
  }

  const dismissedBy =
    typeof options?.dismissedBy === 'string' && options.dismissedBy.trim()
      ? options.dismissedBy.trim()
      : null;

  const { error } = await client.from('outreach_research_queue_dismissals').upsert(
    {
      prospect_id: prospectId,
      dismissed_by: dismissedBy,
      dismissed_at: new Date().toISOString(),
    },
    { onConflict: 'prospect_id' },
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
