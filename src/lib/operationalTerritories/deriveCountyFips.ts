/**
 * ZIP → all intersecting county FIPS (WA/OR/CA).
 * Canonical data: docs/territories/zip-to-county.json (never duplicate into a generated .ts dump).
 * Never picks a "primary" county by ratio — callers consensus-resolve.
 */

import zipToCountyArtifact from '../../../docs/territories/zip-to-county.json';
import { normalizeStateCode, normalizeZip } from '@/lib/operationalTerritories/resolve';

export type ZipCountyCrosswalkEntry = {
  zip: string;
  /** Primary state when all counties share one state; otherwise pipe-joined. */
  state_code: string;
  county_fips: readonly string[];
};

type ZipCountyArtifact = {
  source: string;
  effective_date: string;
  description: string;
  zips: ZipCountyCrosswalkEntry[];
};

const artifact = zipToCountyArtifact as ZipCountyArtifact;

export const ZIP_COUNTY_CROSSWALK_SOURCE = artifact.source;
export const ZIP_COUNTY_CROSSWALK_EFFECTIVE_DATE = artifact.effective_date;
export const ZIP_COUNTY_CROSSWALK: readonly ZipCountyCrosswalkEntry[] = artifact.zips;

const index = new Map<string, readonly string[]>();
for (const row of ZIP_COUNTY_CROSSWALK) {
  index.set(row.zip, row.county_fips);
}

export function countiesForZip(
  zipRaw: string | null | undefined,
  stateCode?: string | null,
): string[] {
  const zip = normalizeZip(zipRaw);
  if (!zip) return [];
  const counties = index.get(zip);
  if (!counties || counties.length === 0) return [];

  const state = normalizeStateCode(stateCode);
  if (!state) return [...counties];

  const prefix = state === 'CA' ? '06' : state === 'OR' ? '41' : '53';
  const filtered = counties.filter((fips) => fips.startsWith(prefix));
  return filtered.length > 0 ? filtered : [...counties];
}
