import type { SupabaseClient } from '@supabase/supabase-js';
import {
  OPS_TERRITORY_CODES,
  type OpsTerritoryCode,
} from '@/lib/operationalTerritories/membershipSeedData';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type OperationalTerritoryOption = {
  id: string;
  code: OpsTerritoryCode;
  name: string;
};

type Client = SupabaseClient<Database>;

/**
 * Active operational territories only (status = active + in operational_territories).
 */
export async function fetchOperationalTerritories(
  client: Client = supabase,
): Promise<{ data: OperationalTerritoryOption[]; error: string | null }> {
  const { data, error } = await client
    .from('operational_territories')
    .select('territory_id, territories!inner(id, code, name, status, active)')
    .eq('territories.active', true)
    .eq('territories.status', 'active');

  if (error) {
    return { data: [], error: error.message };
  }

  const allowed = new Set<string>(OPS_TERRITORY_CODES);
  const rows: OperationalTerritoryOption[] = [];
  for (const row of data ?? []) {
    const terr = row.territories as unknown as {
      id: string;
      code: string;
      name: string;
      status: string;
      active: boolean;
    } | null;
    if (!terr || !allowed.has(terr.code)) continue;
    rows.push({
      id: terr.id,
      code: terr.code as OpsTerritoryCode,
      name: terr.name,
    });
  }

  rows.sort((a, b) => OPS_TERRITORY_CODES.indexOf(a.code) - OPS_TERRITORY_CODES.indexOf(b.code));
  return { data: rows, error: null };
}
