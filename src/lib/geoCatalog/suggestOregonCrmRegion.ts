import { extractPostal5 } from '@/lib/accountImport/addressParse';
import { countiesForZip } from '@/lib/operationalTerritories/deriveCountyFips';
import { normalizeZip } from '@/lib/operationalTerritories/resolve';

/** Catalog `prospects.region` values for Oregon driveable clusters. */
export type OregonCrmRegion =
  | 'Portland Metro & Gorge'
  | 'Willamette Valley'
  | 'Oregon Coast'
  | 'Southern Oregon'
  | 'Central Oregon'
  | 'Eastern Oregon';

export type OregonRegionConfidence = 'high' | 'medium' | 'low';

export type OregonRegionMatchedBy =
  'primary_district' | 'import_csv' | 'county' | 'county_consensus' | 'city_alias';

export type SuggestOregonCrmRegionInput = {
  primaryDistrict?: string | null;
  postalCode?: string | null;
  address?: string | null;
  city?: string | null;
  name?: string | null;
  prospectId?: number | null;
  externalId?: string | null;
  /** Optional overlay from import CSVs (crm_id / external_id → region). */
  importOverlay?: OregonImportRegionOverlay;
};

export type SuggestOregonCrmRegionResult =
  | {
      ok: true;
      region: OregonCrmRegion;
      matchedBy: OregonRegionMatchedBy;
      confidence: OregonRegionConfidence;
    }
  | {
      ok: false;
      reason: 'missing_geography' | 'multi_county_span' | 'unknown_county' | 'unmapped_district';
      detail?: string;
    };

export type OregonImportRegionOverlay = {
  byProspectId: ReadonlyMap<number, OregonCrmRegion>;
  byExternalId: ReadonlyMap<string, OregonCrmRegion>;
  /** Lowercase trimmed business name → region (import CSV fallback). */
  byNormalizedName: ReadonlyMap<string, OregonCrmRegion>;
};

/** All 36 Oregon county FIPS → driveable CRM region (2024 Census). */
export const OR_COUNTY_FIPS_TO_CRM_REGION: Readonly<Record<string, OregonCrmRegion>> = {
  // Portland Metro & Gorge
  '41005': 'Portland Metro & Gorge', // Clackamas
  '41009': 'Portland Metro & Gorge', // Columbia
  '41027': 'Portland Metro & Gorge', // Hood River
  '41051': 'Portland Metro & Gorge', // Multnomah
  '41067': 'Portland Metro & Gorge', // Washington
  // Willamette Valley
  '41003': 'Willamette Valley', // Benton
  '41039': 'Willamette Valley', // Lane
  '41043': 'Willamette Valley', // Linn
  '41047': 'Willamette Valley', // Marion
  '41053': 'Willamette Valley', // Polk
  '41071': 'Willamette Valley', // Yamhill
  // Oregon Coast
  '41007': 'Oregon Coast', // Clatsop
  '41011': 'Oregon Coast', // Coos
  '41015': 'Oregon Coast', // Curry
  '41041': 'Oregon Coast', // Lincoln
  '41057': 'Oregon Coast', // Tillamook
  // Southern Oregon
  '41019': 'Southern Oregon', // Douglas
  '41029': 'Southern Oregon', // Jackson
  '41033': 'Southern Oregon', // Josephine
  '41035': 'Southern Oregon', // Klamath
  // Central Oregon
  '41013': 'Central Oregon', // Crook
  '41017': 'Central Oregon', // Deschutes
  '41031': 'Central Oregon', // Jefferson
  '41065': 'Central Oregon', // Wasco
  '41069': 'Central Oregon', // Wheeler
  // Eastern Oregon
  '41001': 'Eastern Oregon', // Baker
  '41021': 'Eastern Oregon', // Gilliam
  '41023': 'Eastern Oregon', // Grant
  '41025': 'Eastern Oregon', // Harney
  '41037': 'Eastern Oregon', // Lake
  '41045': 'Eastern Oregon', // Malheur
  '41049': 'Eastern Oregon', // Morrow
  '41055': 'Eastern Oregon', // Sherman
  '41059': 'Eastern Oregon', // Umatilla
  '41061': 'Eastern Oregon', // Union
  '41063': 'Eastern Oregon', // Wallowa
};

const OR_CRM_REGION_SET = new Set<string>(Object.values(OR_COUNTY_FIPS_TO_CRM_REGION));

/** Normalize import / primary_district labels to catalog region values. */
export function normalizeOregonPrimaryDistrict(
  district: string | null | undefined,
): OregonCrmRegion | null {
  const raw = (district ?? '').trim();
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/\s+/g, ' ');
  const aliases: Record<string, OregonCrmRegion> = {
    'oregon coast': 'Oregon Coast',
    'willamette valley': 'Willamette Valley',
    'portland metro': 'Portland Metro & Gorge',
    'portland metro & gorge': 'Portland Metro & Gorge',
    'central oregon': 'Central Oregon',
    'southern oregon': 'Southern Oregon',
    'eastern oregon': 'Eastern Oregon',
  };
  if (aliases[key]) return aliases[key];
  if (OR_CRM_REGION_SET.has(raw)) return raw as OregonCrmRegion;
  return null;
}

const OR_CITY_ALIASES: Readonly<Record<string, OregonCrmRegion>> = {
  'government camp': 'Portland Metro & Gorge',
  'grand ronde': 'Willamette Valley',
  'hood river': 'Portland Metro & Gorge',
  'cottage grove': 'Willamette Valley',
};

function normalizeCityKey(city: string | null | undefined): string {
  return (city ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[–—]/g, '-');
}

function regionFromCountyFips(fips: string): OregonCrmRegion | null {
  return OR_COUNTY_FIPS_TO_CRM_REGION[fips] ?? null;
}

function regionFromZip(
  postalCode: string | null | undefined,
  address: string | null | undefined,
): {
  region: OregonCrmRegion;
  matchedBy: 'county' | 'county_consensus';
} | null {
  const zip = normalizeZip(postalCode) ?? extractPostal5(address);
  if (!zip) return null;

  const counties = countiesForZip(zip, 'OR');
  if (counties.length === 0) return null;

  const regions = new Set<OregonCrmRegion>();
  for (const fips of counties) {
    const region = regionFromCountyFips(fips);
    if (region) regions.add(region);
  }

  if (regions.size === 1) {
    const region = [...regions][0];
    return {
      region,
      matchedBy: counties.length === 1 ? 'county' : 'county_consensus',
    };
  }
  if (regions.size > 1) return null;
  return null;
}

/**
 * Deterministic Oregon CRM region suggestion. Never writes DB.
 * Tier order: primary_district → import overlay → ZIP/county → city alias.
 */
export function suggestOregonCrmRegion(
  input: SuggestOregonCrmRegionInput,
): SuggestOregonCrmRegionResult {
  const fromDistrict = normalizeOregonPrimaryDistrict(input.primaryDistrict);
  if (fromDistrict) {
    return {
      ok: true,
      region: fromDistrict,
      matchedBy: 'primary_district',
      confidence: 'high',
    };
  }

  const overlay = input.importOverlay;
  if (overlay) {
    const id = input.prospectId;
    if (id != null && overlay.byProspectId.has(id)) {
      return {
        ok: true,
        region: overlay.byProspectId.get(id)!,
        matchedBy: 'import_csv',
        confidence: 'high',
      };
    }
    const ext = (input.externalId ?? '').trim();
    if (ext && overlay.byExternalId.has(ext)) {
      return {
        ok: true,
        region: overlay.byExternalId.get(ext)!,
        matchedBy: 'import_csv',
        confidence: 'high',
      };
    }
    const nameKey = normalizeCityKey(input.name);
    if (nameKey && overlay.byNormalizedName.has(nameKey)) {
      return {
        ok: true,
        region: overlay.byNormalizedName.get(nameKey)!,
        matchedBy: 'import_csv',
        confidence: 'high',
      };
    }
  }

  const fromZip = regionFromZip(input.postalCode, input.address);
  if (fromZip) {
    return {
      ok: true,
      region: fromZip.region,
      matchedBy: fromZip.matchedBy,
      confidence: 'medium',
    };
  }

  const zip = normalizeZip(input.postalCode) ?? extractPostal5(input.address);
  if (zip) {
    const counties = countiesForZip(zip, 'OR');
    if (counties.length > 0) {
      const regions = new Set(
        counties.map((f) => regionFromCountyFips(f)).filter((r): r is OregonCrmRegion => r != null),
      );
      if (regions.size > 1) {
        const cityKey = normalizeCityKey(input.city);
        const fromCity = cityKey ? OR_CITY_ALIASES[cityKey] : undefined;
        if (fromCity) {
          return {
            ok: true,
            region: fromCity,
            matchedBy: 'city_alias',
            confidence: 'low',
          };
        }
        return {
          ok: false,
          reason: 'multi_county_span',
          detail: zip,
        };
      }
      if (regions.size === 0) {
        return { ok: false, reason: 'unknown_county', detail: counties.join(',') };
      }
    }
  }

  const cityKey = normalizeCityKey(input.city);
  const fromCity = cityKey ? OR_CITY_ALIASES[cityKey] : undefined;
  if (fromCity) {
    return {
      ok: true,
      region: fromCity,
      matchedBy: 'city_alias',
      confidence: 'low',
    };
  }

  return {
    ok: false,
    reason: 'missing_geography',
    detail: zip ?? cityKey ?? undefined,
  };
}

/** True when confidence is high or medium (default apply threshold). */
export function isOregonRegionApplyConfidence(confidence: OregonRegionConfidence): boolean {
  return confidence === 'high' || confidence === 'medium';
}
