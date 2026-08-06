import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export const BC_TERRITORY_CODE = 'bc';

export type TerritoryCode = 'bc' | 'ab' | 'ca' | 'or' | 'wa';

export type Territory = {
  id: string;
  code: string;
  name: string;
  countryCode: string;
  sortOrder: number;
  active: boolean;
};

type TerritoryClient = SupabaseClient<Database>;

/** Map province/state text from inbound forms onto a territory code (default BC). */
export function territoryCodeFromProvince(province: string | null | undefined): string {
  const p = (province ?? '').trim().toUpperCase();
  if (p === 'BC' || p === 'BRITISH COLUMBIA') return 'bc';
  if (p === 'AB' || p === 'ALBERTA') return 'ab';
  if (p === 'CA' || p === 'CALIFORNIA') return 'ca';
  if (p === 'OR' || p === 'OREGON') return 'or';
  if (p === 'WA' || p === 'WASHINGTON') return 'wa';
  return BC_TERRITORY_CODE;
}

export async function fetchTerritories(
  client: TerritoryClient = supabase,
): Promise<{ data: Territory[]; error: string | null }> {
  const { data, error } = await client
    .from('territories')
    .select('id, code, name, country_code, sort_order, active')
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      countryCode: row.country_code,
      sortOrder: row.sort_order,
      active: row.active,
    })),
    error: null,
  };
}

export async function resolveTerritoryIdByCode(
  client: TerritoryClient,
  code: string = BC_TERRITORY_CODE,
): Promise<{ id: string } | { error: string }> {
  const normalized = code.trim().toLowerCase() || BC_TERRITORY_CODE;
  const { data, error } = await client
    .from('territories')
    .select('id')
    .eq('code', normalized)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data?.id) return { error: `Territory not found for code "${normalized}"` };
  return { id: data.id };
}
