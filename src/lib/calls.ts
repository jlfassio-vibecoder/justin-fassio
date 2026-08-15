import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { supabase } from '@/lib/supabase';
import { formatOutreachPreparationDate } from '@/lib/outreachSelectTargets';
import { AGENT_OUTREACH_PREP_TZ } from '@/lib/outreachSelectionConstants';

type Client = SupabaseClient<Database>;

export const CALL_SELECT =
  'id, prospect_id, contact_name, outcome, pmf_score, order_value_cad, call_date, notes, objection_tags, line_id, retailer_line_account_id' as const;

export type CallRow = {
  id: string;
  prospect_id: number;
  contact_name: string | null;
  outcome: string;
  pmf_score: number | null;
  order_value_cad: number | null;
  call_date: string;
  notes: string | null;
  objection_tags: string[];
  line_id: string | null;
  retailer_line_account_id: string | null;
};

export type FetchCallsOptions = {
  limit?: number;
  /** When set, only calls for this sales line (Phase 2 scoped reads). */
  salesLineId?: string;
};

export async function fetchCalls(limitOrOptions: number | FetchCallsOptions = 500): Promise<{
  data: CallRow[];
  error: string | null;
}> {
  const options: FetchCallsOptions =
    typeof limitOrOptions === 'number' ? { limit: limitOrOptions } : limitOrOptions;
  const limit = options.limit ?? 500;

  let query = supabase
    .from('calls')
    .select(CALL_SELECT)
    .order('call_date', { ascending: false })
    .limit(limit);

  if (options.salesLineId) {
    query = query.eq('line_id', options.salesLineId);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as CallRow[], error: null };
}

/**
 * Thin Phase 3 helper: prospects with calls.follow_up_date <= today (Vancouver).
 * Does not change CALL_SELECT / Dashboard fetch shape. Read-only; no log-call UI.
 */
export async function fetchDueCallFollowUps(
  client: Client,
  options?: { asOf?: Date; prospectIds?: number[] },
): Promise<Set<number>> {
  const today = formatOutreachPreparationDate(options?.asOf ?? new Date(), AGENT_OUTREACH_PREP_TZ);
  let query = client
    .from('calls')
    .select('prospect_id, follow_up_date')
    .not('follow_up_date', 'is', null)
    .lte('follow_up_date', today);

  if (options?.prospectIds && options.prospectIds.length > 0) {
    query = query.in('prospect_id', options.prospectIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const due = new Set<number>();
  for (const row of data ?? []) {
    if (typeof row.prospect_id === 'number' && Number.isFinite(row.prospect_id)) {
      due.add(row.prospect_id);
    }
  }
  return due;
}
