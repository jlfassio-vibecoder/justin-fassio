import { extractPostal5 } from '@/lib/accountImport/addressParse';
import {
  allowedOpsCodesForStore,
  storeCodeToStateCode,
} from '@/lib/operationalTerritories/allowedOperationalTerritories';
import { countiesForZip } from '@/lib/operationalTerritories/deriveCountyFips';
import type { OpsTerritoryCode } from '@/lib/operationalTerritories/membershipSeedData';
import { normalizeZip, resolveOperationalTerritory } from '@/lib/operationalTerritories/resolve';

export type SuggestOperationalTerritoryInput = {
  postalCode?: string | null;
  address?: string | null;
  storeTerritoryCode?: string | null;
};

export type SuggestOperationalTerritoryResult =
  | {
      ok: true;
      territoryCode: OpsTerritoryCode;
      matchedBy: 'zip' | 'county' | 'county_consensus';
    }
  | {
      ok: false;
      reason:
        | 'missing_zip_or_county'
        | 'unresolved_geography'
        | 'la_zip_unlisted'
        | 'coverage_gap'
        | 'store_not_eligible';
      detail?: string;
    };

/**
 * Deterministic suggestion only. Never writes DB.
 * ZIP exact → else multi-county consensus → unresolved.
 */
export function suggestOperationalTerritoryForAccount(
  input: SuggestOperationalTerritoryInput,
): SuggestOperationalTerritoryResult {
  const store = (input.storeTerritoryCode ?? '').trim().toLowerCase();
  if (store === 'bc' || store === 'ab' || store === '') {
    return { ok: false, reason: 'store_not_eligible' };
  }
  if (store !== 'ca' && store !== 'or' && store !== 'wa') {
    return { ok: false, reason: 'store_not_eligible' };
  }

  const stateCode = storeCodeToStateCode(store);
  const zip = normalizeZip(input.postalCode) ?? extractPostal5(input.address);
  if (!zip) {
    return { ok: false, reason: 'missing_zip_or_county' };
  }

  // 1) Exact ZIP membership (LA and any future zip rows) wins first.
  const zipHit = resolveOperationalTerritory({ zip, stateCode });
  if (zipHit.ok && zipHit.matchedBy === 'zip') {
    return filterByStoreAllowlist(zipHit, store);
  }

  // 2) All candidate counties → consensus
  const counties = countiesForZip(zip, stateCode);
  if (counties.length === 0) {
    if (!zipHit.ok && zipHit.reason === 'la_zip_unlisted') {
      return zipHit;
    }
    return { ok: false, reason: 'unresolved_geography', detail: zip };
  }

  const codes = new Set<OpsTerritoryCode>();
  let coverageGap: string | undefined;
  for (const countyFips of counties) {
    const r = resolveOperationalTerritory({ countyFips, stateCode });
    if (r.ok) {
      codes.add(r.territoryCode);
      continue;
    }
    if (r.reason === 'coverage_gap') {
      coverageGap = r.detail ?? countyFips;
    }
    if (r.reason === 'la_zip_unlisted' || r.reason === 'missing_zip_or_county') {
      // LA county without ZIP exact already handled above; skip for consensus
      continue;
    }
  }

  if (codes.size === 1) {
    const territoryCode = [...codes][0];
    const matchedBy = counties.length === 1 ? ('county' as const) : ('county_consensus' as const);
    return filterByStoreAllowlist({ ok: true, territoryCode, matchedBy }, store);
  }
  if (codes.size > 1) {
    return {
      ok: false,
      reason: 'unresolved_geography',
      detail: `multi_county_span:${zip}`,
    };
  }
  if (coverageGap) {
    return { ok: false, reason: 'coverage_gap', detail: coverageGap };
  }
  if (!zipHit.ok) return zipHit;
  return { ok: false, reason: 'unresolved_geography', detail: zip };
}

function filterByStoreAllowlist(
  hit: Extract<SuggestOperationalTerritoryResult, { ok: true }>,
  storeCode: string,
): SuggestOperationalTerritoryResult {
  const allowed = allowedOpsCodesForStore(storeCode);
  if (!(allowed as readonly string[]).includes(hit.territoryCode)) {
    return {
      ok: false,
      reason: 'unresolved_geography',
      detail: `not_allowed_for_store:${hit.territoryCode}`,
    };
  }
  return hit;
}
