import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export const BC_TERRITORY_CODE = 'bc';

/** Province/state store geos only — excludes child regions like Northern California. */
export const STORE_TERRITORY_CODES = ['bc', 'ab', 'ca', 'or', 'wa'] as const;

export type TerritoryCode = (typeof STORE_TERRITORY_CODES)[number];

export function isStoreTerritoryCode(code: string | null | undefined): code is TerritoryCode {
  return (STORE_TERRITORY_CODES as readonly string[]).includes((code ?? '').trim().toLowerCase());
}

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

/**
 * Suggest a store territory code from region text for address-edit hints only.
 * Returns null for unknown values — never defaults to BC.
 * Do not use territoryCodeFromProvince for suggestions (it BC-defaults unknowns).
 */
export function suggestTerritoryCodeFromRegion(region: string | null | undefined): string | null {
  const p = (region ?? '').trim().toUpperCase();
  if (!p) return null;
  if (p === 'BC' || p === 'BRITISH COLUMBIA') return 'bc';
  if (p === 'AB' || p === 'ALBERTA') return 'ab';
  if (p === 'CA' || p === 'CALIFORNIA') return 'ca';
  if (p === 'OR' || p === 'OREGON') return 'or';
  if (p === 'WA' || p === 'WASHINGTON') return 'wa';
  return null;
}

/**
 * Resolve store territory for Add via AI / enrich inserts.
 * Prefers researched province/state, then region label, then an explicit inbound seed.
 * Never BC-defaults unknowns (unlike territoryCodeFromProvince).
 */
export function resolveStoreTerritoryCodeFromEnrichment(input: {
  provinceOrState?: string | null;
  region?: string | null;
  seedTerritoryCode?: string | null;
}): string | null {
  const fromProvince = suggestTerritoryCodeFromRegion(input.provinceOrState);
  if (fromProvince) return fromProvince;
  const fromRegion = suggestTerritoryCodeFromRegion(input.region);
  if (fromRegion) return fromRegion;
  const seed = (input.seedTerritoryCode ?? '').trim().toLowerCase();
  if (isStoreTerritoryCode(seed)) return seed;
  return null;
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

/** Active store-level territories only (bc/ab/ca/or/wa) — never Northern California. */
export async function fetchStoreTerritories(
  client: TerritoryClient = supabase,
): Promise<{ data: Territory[]; error: string | null }> {
  const result = await fetchTerritories(client);
  if (result.error) return result;
  return {
    data: result.data.filter((row) => isStoreTerritoryCode(row.code)),
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
