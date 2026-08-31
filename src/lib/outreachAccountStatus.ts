/**
 * Resolve directory AccountStatus for prospect IDs via OGR RLA when present.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { accountStatusFromRelationship } from '@/lib/ogrCommercial';
import type { AccountStatus, Database } from '@/types/database';

type Client = SupabaseClient<Database>;

export async function loadResolvedAccountStatusByIds(
  client: Client,
  prospectIds: number[],
): Promise<Map<number, AccountStatus>> {
  const ids = [...new Set(prospectIds.filter((id) => Number.isFinite(id)))];
  const out = new Map<number, AccountStatus>();
  if (ids.length === 0) return out;

  const { data, error } = await client.from('prospects').select('id, account_status').in('id', ids);
  if (error) throw new Error(error.message);

  const { data: ogr } = await client.from('lines').select('id').eq('code', 'ogr').maybeSingle();
  const rlaStatus = new Map<number, AccountStatus>();
  if (ogr) {
    const { data: rlas, error: rlaError } = await client
      .from('retailer_line_accounts')
      .select('retailer_id, relationship_status')
      .eq('sales_line_id', ogr.id)
      .in('retailer_id', ids);
    if (rlaError) throw new Error(rlaError.message);
    for (const row of rlas ?? []) {
      rlaStatus.set(row.retailer_id, accountStatusFromRelationship(row.relationship_status));
    }
  }

  for (const row of data ?? []) {
    out.set(row.id, rlaStatus.get(row.id) ?? (row.account_status as AccountStatus));
  }
  return out;
}

export function isActiveAccountStatus(status: string | null | undefined): boolean {
  return status === 'active_account';
}
