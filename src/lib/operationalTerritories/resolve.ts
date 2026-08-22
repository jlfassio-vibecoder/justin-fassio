/**
 * Resolve operational (sales) territory from ZIP then county.
 * Never writes prospects.territory_id or line rights.
 */

import {
  COUNTY_MEMBERSHIP_SEEDS,
  ZIP_MEMBERSHIP_SEEDS,
  type OpsTerritoryCode,
} from '@/lib/operationalTerritories/membershipSeedData';

export type ResolveOperationalTerritoryInput = {
  zip?: string | null;
  /** 5-digit state+county FIPS (e.g. 06053) or county FIPS with state_code */
  countyFips?: string | null;
  stateCode?: 'WA' | 'OR' | 'CA' | string | null;
};

export type ResolveOperationalTerritoryResult =
  | { ok: true; territoryCode: OpsTerritoryCode; matchedBy: 'zip' | 'county' }
  | {
      ok: false;
      reason: 'missing_zip_or_county' | 'unresolved_geography' | 'la_zip_unlisted' | 'coverage_gap';
      detail?: string;
    };

const LA_COUNTY_FIPS = '06037';

const zipIndex = new Map<string, OpsTerritoryCode>();
for (const row of ZIP_MEMBERSHIP_SEEDS) {
  zipIndex.set(`${row.state_code}:${row.zip}`, row.territory_code);
}

const countyIndex = new Map<string, OpsTerritoryCode>();
for (const row of COUNTY_MEMBERSHIP_SEEDS) {
  countyIndex.set(`${row.state_code}:${row.county_fips}`, row.territory_code);
}

export function normalizeZip(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 5) return null;
  return digits.slice(0, 5);
}

export function normalizeStateCode(raw: string | null | undefined): 'WA' | 'OR' | 'CA' | null {
  const s = (raw ?? '').trim().toUpperCase();
  if (s === 'WA' || s === 'OR' || s === 'CA') return s;
  if (s === 'WASHINGTON') return 'WA';
  if (s === 'OREGON') return 'OR';
  if (s === 'CALIFORNIA') return 'CA';
  return null;
}

export function normalizeCountyFips(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 5) return digits;
  if (digits.length === 3) return null; // need state prefix
  if (digits.length === 4) return `0${digits}`;
  return null;
}

/**
 * ZIP exact → county → unresolved. Unknown ZIPs are never inferred.
 */
export function resolveOperationalTerritory(
  input: ResolveOperationalTerritoryInput,
): ResolveOperationalTerritoryResult {
  const zip = normalizeZip(input.zip);
  let state = normalizeStateCode(input.stateCode);
  const countyFips = normalizeCountyFips(input.countyFips);

  if (!zip && !countyFips) {
    return { ok: false, reason: 'missing_zip_or_county' };
  }

  if (zip) {
    // Prefer explicit state; else try CA/WA/OR zip indexes in that order only when state known
    const statesToTry: Array<'WA' | 'OR' | 'CA'> = state ? [state] : (['CA', 'WA', 'OR'] as const);
    for (const st of statesToTry) {
      const hit = zipIndex.get(`${st}:${zip}`);
      if (hit) {
        return { ok: true, territoryCode: hit, matchedBy: 'zip' };
      }
    }

    if (countyFips === LA_COUNTY_FIPS || state === 'CA') {
      // In LA county context, unlisted ZIP is a specific review reason
      if (countyFips === LA_COUNTY_FIPS) {
        return { ok: false, reason: 'la_zip_unlisted', detail: zip };
      }
    }
  }

  if (countyFips) {
    if (countyFips === LA_COUNTY_FIPS) {
      return {
        ok: false,
        reason: zip ? 'la_zip_unlisted' : 'missing_zip_or_county',
        detail: zip ?? undefined,
      };
    }

    if (!state) {
      // Derive state from FIPS prefix
      if (countyFips.startsWith('53')) state = 'WA';
      else if (countyFips.startsWith('41')) state = 'OR';
      else if (countyFips.startsWith('06')) state = 'CA';
    }

    if (state) {
      const hit = countyIndex.get(`${state}:${countyFips}`);
      if (hit) {
        return { ok: true, territoryCode: hit, matchedBy: 'county' };
      }
      // County FIPS looks like WA/OR/CA but missing from seed → coverage gap
      if (state === 'WA' || state === 'OR' || state === 'CA') {
        return { ok: false, reason: 'coverage_gap', detail: countyFips };
      }
    }
  }

  return { ok: false, reason: 'unresolved_geography' };
}

/** Line consumption allowlists (activation later; used for policy checks). */
export const OGR_OPERATIONAL_TERRITORY_CODES = ['pnw-west', 'pnw-east'] as const;

export function ogrMayConsumeOperationalTerritory(code: string): boolean {
  return (OGR_OPERATIONAL_TERRITORY_CODES as readonly string[]).includes(code);
}
