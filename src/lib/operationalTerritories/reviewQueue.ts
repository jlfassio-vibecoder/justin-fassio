import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

type Client = SupabaseClient<Database>;

/**
 * Resolve outstanding ops-territory review rows for a prospect.
 * Call only after staff confirms a non-null operational_territory_id.
 * Clearing an assignment must not call this.
 */
export async function resolveOperationalTerritoryReviewForProspect(
  prospectId: number,
  client: Client = supabase,
): Promise<{ ok: true; resolved: number } | { ok: false; error: string }> {
  const { data, error } = await client
    .from('operational_territory_review_queue')
    .update({ resolved_at: new Date().toISOString() })
    .eq('entity_type', 'prospect')
    .eq('entity_id', String(prospectId))
    .is('resolved_at', null)
    .select('id');

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, resolved: data?.length ?? 0 };
}
