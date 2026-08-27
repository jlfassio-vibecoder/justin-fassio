import type { TerritoryCode } from '@/lib/territories';

export type GeoRegionOption = { value: string; label: string };

/** Sentinel filter value for accounts still labeled with the whole territory name. */
export const UNASSIGNED_REGION_VALUE = '__unassigned__';

const BC_REGIONS: readonly GeoRegionOption[] = [
  { value: 'Okanagan', label: 'Okanagan Valley' },
  { value: 'Shuswap', label: 'Shuswap & Thompson-Nicola' },
  { value: 'Vancouver Island', label: 'Vancouver Island & Gulf Islands' },
  { value: 'Sea-to-Sky', label: 'Sea-to-Sky & Sunshine Coast' },
  { value: 'Kootenays', label: 'Kootenays & Columbia-Shuswap' },
  { value: 'Fraser Valley', label: 'Lower Mainland / Fraser Valley' },
];

const OR_REGIONS: readonly GeoRegionOption[] = [
  { value: 'Portland Metro & Gorge', label: 'Portland Metro & Gorge' },
  { value: 'Willamette Valley', label: 'Willamette Valley' },
  { value: 'Oregon Coast', label: 'Oregon Coast' },
  { value: 'Southern Oregon', label: 'Southern Oregon' },
  { value: 'Central Oregon', label: 'Central Oregon' },
  { value: 'Eastern Oregon', label: 'Eastern Oregon' },
];

const WA_REGIONS: readonly GeoRegionOption[] = [
  { value: 'Puget Sound', label: 'Puget Sound' },
  { value: 'Olympic Peninsula & Coast', label: 'Olympic Peninsula & Coast' },
  { value: 'Southwest Washington', label: 'Southwest Washington' },
  { value: 'North Cascades', label: 'North Cascades' },
  { value: 'Eastern Washington', label: 'Eastern Washington' },
];

const CA_REGIONS: readonly GeoRegionOption[] = [
  { value: 'NorCal Coastal', label: 'NorCal Coastal' },
  { value: 'NorCal Inland', label: 'NorCal Inland' },
  { value: 'Central Coast / LA North', label: 'Central Coast / LA North' },
  { value: 'LA Metro / OC', label: 'LA Metro / OC' },
  { value: 'Inland Empire / San Diego', label: 'Inland Empire / San Diego' },
];

/** Driveable CRM regions nested under store territory codes. */
export const REGIONS_BY_TERRITORY: Readonly<
  Partial<Record<TerritoryCode, readonly GeoRegionOption[]>>
> = {
  bc: BC_REGIONS,
  or: OR_REGIONS,
  wa: WA_REGIONS,
  ca: CA_REGIONS,
  // Alberta: no driveable-region catalog in v1
};

/** Statewide leftovers still stored on prospects.region before staff recode. */
export const STATEWIDE_REGION_BY_TERRITORY: Readonly<Partial<Record<TerritoryCode, string>>> = {
  bc: 'British Columbia',
  ab: 'Alberta',
  ca: 'California',
  or: 'Oregon',
  wa: 'Washington',
};

const ALL_STATEWIDE_REGION_LABELS = new Set(
  Object.values(STATEWIDE_REGION_BY_TERRITORY).map((v) => v.toLowerCase()),
);

export function isUnassignedRegionFilter(region: string): boolean {
  return region === UNASSIGNED_REGION_VALUE;
}

/** Normalize briefing region for prep run identity (ALL → null). */
export function normalizePrepCrmRegion(region: string | null | undefined): string | null {
  const trimmed = region?.trim();
  if (!trimmed || trimmed === 'ALL') return null;
  return trimmed;
}

/** Case-insensitive city key for equality matching. */
export function normalizeCityKey(city: string | null | undefined): string {
  return (city ?? '').trim().toLowerCase();
}

/** Normalize briefing city for prep run identity (ALL/empty → null; case-stable). */
export function normalizePrepCity(city: string | null | undefined): string | null {
  const trimmed = city?.trim();
  if (!trimmed || trimmed.toLowerCase() === 'all') return null;
  // Lowercase so Newport/newport share one regional prep identity.
  return trimmed.toLowerCase();
}

/** Whether a prospect city matches a briefing city filter (exact, case-insensitive). */
export function prospectMatchesPrepCity(
  prospectCity: string | null | undefined,
  filterCity: string | null | undefined,
): boolean {
  const filter = normalizePrepCity(filterCity);
  if (!filter) return true;
  return normalizeCityKey(prospectCity) === normalizeCityKey(filter);
}

/** Whether a prospect's CRM region matches a directory/briefing region filter. */
export function prospectMatchesCrmRegion(
  prospectRegion: string,
  filterRegion: string,
  territoryCode?: string | null,
): boolean {
  const filter = filterRegion.trim();
  if (!filter || filter === 'ALL') return true;
  if (isUnassignedRegionFilter(filter)) {
    return isStatewideRegionLabel(prospectRegion, territoryCode);
  }
  return prospectRegion === filter;
}

/** True when region text is a whole-territory leftover (case-insensitive). */
export function isStatewideRegionLabel(region: string, territoryCode?: string | null): boolean {
  const trimmed = region.trim();
  if (!trimmed) return false;
  if (territoryCode) {
    const expected = STATEWIDE_REGION_BY_TERRITORY[territoryCode as TerritoryCode];
    if (expected) return trimmed.toLowerCase() === expected.toLowerCase();
  }
  return ALL_STATEWIDE_REGION_LABELS.has(trimmed.toLowerCase());
}

/**
 * Region options for a territory filter dropdown.
 * When territory is ALL or empty, only "All regions".
 * Unknown territory codes get All regions + Unassigned (no driveable clusters).
 */
export function regionOptionsForTerritory(territoryCode: string): GeoRegionOption[] {
  const code = territoryCode.trim().toLowerCase();
  if (!code || code === 'all') {
    return [{ value: 'ALL', label: 'All regions' }];
  }
  const clusters = REGIONS_BY_TERRITORY[code as TerritoryCode] ?? [];
  return [
    { value: 'ALL', label: 'All regions' },
    ...clusters,
    { value: UNASSIGNED_REGION_VALUE, label: 'Unassigned' },
  ];
}

/** Flattened driveable regions for surfaces without a territory control (e.g. Contacts). */
export function allDriveableRegionOptions(): GeoRegionOption[] {
  const seen = new Set<string>();
  const out: GeoRegionOption[] = [{ value: 'ALL', label: 'All regions' }];
  for (const list of Object.values(REGIONS_BY_TERRITORY)) {
    if (!list) continue;
    for (const opt of list) {
      if (seen.has(opt.value)) continue;
      seen.add(opt.value);
      out.push(opt);
    }
  }
  out.push({ value: UNASSIGNED_REGION_VALUE, label: 'Unassigned' });
  return out;
}

/** Datalist suggestions for Account Details, scoped to store territory when known. */
export function regionSuggestionsForTerritory(territoryCode: string | null | undefined): string[] {
  const code = (territoryCode ?? '').trim().toLowerCase();
  const clusters = REGIONS_BY_TERRITORY[code as TerritoryCode];
  if (clusters) return clusters.map((r) => r.value);
  // Unknown / empty: offer all driveable values (no statewide leftovers).
  return allDriveableRegionOptions()
    .filter((o) => o.value !== 'ALL' && o.value !== UNASSIGNED_REGION_VALUE)
    .map((o) => o.value);
}

/** Map a driveable region to pnw-west / pnw-east for the prep API ops territory. */
export function opsCodeForBriefingRegion(
  storeTerritoryCode: 'or' | 'wa' | '',
  region: string,
): 'pnw-west' | 'pnw-east' | null {
  if (storeTerritoryCode !== 'or' && storeTerritoryCode !== 'wa') return null;
  if (!region || region === 'ALL' || region === UNASSIGNED_REGION_VALUE) {
    return 'pnw-west';
  }
  if (storeTerritoryCode === 'or') {
    if (region === 'Central Oregon' || region === 'Eastern Oregon') return 'pnw-east';
    if (OR_REGIONS.some((r) => r.value === region)) return 'pnw-west';
  }
  if (storeTerritoryCode === 'wa') {
    if (region === 'North Cascades' || region === 'Eastern Washington') return 'pnw-east';
    if (WA_REGIONS.some((r) => r.value === region)) return 'pnw-west';
  }
  return 'pnw-west';
}

/** Resolve store territory code from a driveable CRM region label (exact match). */
export function territoryCodeFromDriveableRegion(
  region: string | null | undefined,
): TerritoryCode | null {
  const trimmed = (region ?? '').trim();
  if (!trimmed) return null;
  for (const [code, list] of Object.entries(REGIONS_BY_TERRITORY)) {
    if (!list) continue;
    if (list.some((r) => r.value === trimmed)) return code as TerritoryCode;
  }
  return null;
}

/**
 * @deprecated Prefer regionOptionsForTerritory(territoryCode). Flat list kept for
 * gradual callers; excludes statewide Oregon/Washington.
 */
export const REGION_OPTIONS: GeoRegionOption[] = allDriveableRegionOptions();
