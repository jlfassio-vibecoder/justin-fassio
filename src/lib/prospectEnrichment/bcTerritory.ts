import type { ProspectRegion } from '@/lib/prospects';

export const PRIMARY_DISTRICTS = [
  'Okanagan',
  'Thompson and Kootenays',
  'Lower Mainland',
  'Vancouver Island',
  'Northern British Columbia',
] as const;

export type PrimaryDistrict = (typeof PRIMARY_DISTRICTS)[number];

export const SUBTERRITORIES = [
  'Central Okanagan',
  'South Okanagan',
  'North Okanagan',
  'Thompson',
  'Kootenays',
  'Lower Mainland',
  'Fraser Valley',
  'Sea-to-Sky',
  'Sunshine Coast',
  'Vancouver Island South',
  'Vancouver Island Central',
  'Vancouver Island North',
  'Cariboo',
  'Prince George',
  'Bulkley Valley',
  'Northwest BC',
  'Peace Region',
  'Needs mapping',
] as const;

export type Subterritory = (typeof SUBTERRITORIES)[number];

export type BcTerritoryMap = {
  primaryDistrict: PrimaryDistrict | 'Needs mapping';
  subterritory: Subterritory;
};

/** Dense-market subterritories that add +1 to seed fit (doc §4). */
export const DENSE_SUBTERRITORIES: readonly Subterritory[] = [
  'Central Okanagan',
  'South Okanagan',
  'North Okanagan',
  'Lower Mainland',
  'Fraser Valley',
  'Vancouver Island Central',
];

/** Remote subterritories that subtract -1 from seed fit / affect Tier rules. */
export const REMOTE_SUBTERRITORIES: readonly Subterritory[] = [
  'Vancouver Island North',
  'Cariboo',
  'Bulkley Valley',
  'Northwest BC',
  'Peace Region',
  'Prince George',
];

/** City (lowercase) → subterritory. Extend as needed; unknown cities → Needs mapping. */
const CITY_TO_SUBTERRITORY: Record<string, Subterritory> = {
  kelowna: 'Central Okanagan',
  'west kelowna': 'Central Okanagan',
  winfield: 'Central Okanagan',
  peachland: 'Central Okanagan',
  penticton: 'South Okanagan',
  summerland: 'South Okanagan',
  oliver: 'South Okanagan',
  osoyoos: 'South Okanagan',
  vernon: 'North Okanagan',
  armstrong: 'North Okanagan',
  enderby: 'North Okanagan',
  lumby: 'North Okanagan',
  kamloops: 'Thompson',
  merritt: 'Thompson',
  ashcroft: 'Thompson',
  'salmon arm': 'Thompson',
  sicamous: 'Thompson',
  chase: 'Thompson',
  cranbrook: 'Kootenays',
  nelson: 'Kootenays',
  trail: 'Kootenays',
  castlegar: 'Kootenays',
  fernie: 'Kootenays',
  kimberley: 'Kootenays',
  invermere: 'Kootenays',
  vancouver: 'Lower Mainland',
  burnaby: 'Lower Mainland',
  richmond: 'Lower Mainland',
  surrey: 'Lower Mainland',
  'north vancouver': 'Lower Mainland',
  'west vancouver': 'Lower Mainland',
  coquitlam: 'Lower Mainland',
  'port coquitlam': 'Lower Mainland',
  'port moody': 'Lower Mainland',
  'new westminster': 'Lower Mainland',
  delta: 'Lower Mainland',
  langley: 'Fraser Valley',
  abbotsford: 'Fraser Valley',
  chilliwack: 'Fraser Valley',
  mission: 'Fraser Valley',
  'maple ridge': 'Fraser Valley',
  hope: 'Fraser Valley',
  whistler: 'Sea-to-Sky',
  squamish: 'Sea-to-Sky',
  pemberton: 'Sea-to-Sky',
  gibsons: 'Sunshine Coast',
  sechelt: 'Sunshine Coast',
  victoria: 'Vancouver Island South',
  sidney: 'Vancouver Island South',
  sooke: 'Vancouver Island South',
  duncan: 'Vancouver Island South',
  nanaimo: 'Vancouver Island Central',
  parksville: 'Vancouver Island Central',
  'qualicum beach': 'Vancouver Island Central',
  courtenay: 'Vancouver Island Central',
  comox: 'Vancouver Island Central',
  'campbell river': 'Vancouver Island Central',
  'port hardy': 'Vancouver Island North',
  'port mcneill': 'Vancouver Island North',
  'alert bay': 'Vancouver Island North',
  quesnel: 'Cariboo',
  'williams lake': 'Cariboo',
  '100 mile house': 'Cariboo',
  'prince george': 'Prince George',
  smithers: 'Bulkley Valley',
  houston: 'Bulkley Valley',
  terrace: 'Northwest BC',
  'prince rupert': 'Northwest BC',
  kitimat: 'Northwest BC',
  'fort st. john': 'Peace Region',
  'fort st john': 'Peace Region',
  'dawson creek': 'Peace Region',
};

function subterritoryToDistrict(sub: Subterritory): PrimaryDistrict | 'Needs mapping' {
  if (sub === 'Needs mapping') return 'Needs mapping';
  if (sub.includes('Okanagan')) return 'Okanagan';
  if (sub === 'Thompson' || sub === 'Kootenays') return 'Thompson and Kootenays';
  if (
    sub === 'Lower Mainland' ||
    sub === 'Fraser Valley' ||
    sub === 'Sea-to-Sky' ||
    sub === 'Sunshine Coast'
  ) {
    return 'Lower Mainland';
  }
  if (sub.startsWith('Vancouver Island')) return 'Vancouver Island';
  return 'Northern British Columbia';
}

function normalizeCityKey(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, ' ').replace(/,.*$/, '');
}

/**
 * Map a BC city to primary district + subterritory.
 * Returns Needs mapping when the city is unknown — never guesses.
 */
export function mapBcTerritory(input: {
  city: string;
  postalCode?: string | null;
}): BcTerritoryMap {
  const key = normalizeCityKey(input.city);
  if (!key) {
    return { primaryDistrict: 'Needs mapping', subterritory: 'Needs mapping' };
  }

  let sub = CITY_TO_SUBTERRITORY[key];
  if (!sub) {
    // Longer keys first so "north vancouver" wins over "vancouver"
    const entries = Object.entries(CITY_TO_SUBTERRITORY).sort((a, b) => b[0].length - a[0].length);
    for (const [cityKey, mapped] of entries) {
      if (key === cityKey || key.startsWith(`${cityKey} `)) {
        sub = mapped;
        break;
      }
    }
  }

  // Postal FSA hints (optional)
  const postal = input.postalCode?.trim().toUpperCase() ?? '';
  if (!sub && postal) {
    const fsa = postal.slice(0, 3);
    if (/^V1[A-Z]$/.test(fsa) || fsa === 'V1Y' || fsa === 'V1W') sub = 'Central Okanagan';
    else if (fsa === 'V2A' || fsa === 'V0H') sub = 'South Okanagan';
    else if (fsa === 'V1B' || fsa === 'V1T') sub = 'North Okanagan';
    else if (fsa.startsWith('V8') || fsa.startsWith('V9')) sub = 'Vancouver Island South';
    else if (fsa.startsWith('V6') || fsa.startsWith('V5') || fsa.startsWith('V7')) {
      sub = 'Lower Mainland';
    }
  }

  if (!sub) {
    return { primaryDistrict: 'Needs mapping', subterritory: 'Needs mapping' };
  }

  return { primaryDistrict: subterritoryToDistrict(sub), subterritory: sub };
}

export function isRemoteSubterritory(subterritory: string | null | undefined): boolean {
  if (!subterritory) return false;
  return (REMOTE_SUBTERRITORIES as readonly string[]).includes(subterritory);
}

export function isDenseSubterritory(subterritory: string | null | undefined): boolean {
  if (!subterritory) return false;
  return (DENSE_SUBTERRITORIES as readonly string[]).includes(subterritory);
}

/** Map territory onto existing CRM region filter enum. */
export function crmRegionFromTerritory(map: BcTerritoryMap): ProspectRegion | null {
  if (map.primaryDistrict === 'Needs mapping') return null;
  if (map.primaryDistrict === 'Okanagan') return 'Okanagan';
  if (map.primaryDistrict === 'Vancouver Island') return 'Vancouver Island';
  if (map.subterritory === 'Sea-to-Sky' || map.subterritory === 'Sunshine Coast') {
    return 'Sea-to-Sky';
  }
  if (map.primaryDistrict === 'Lower Mainland') return 'Fraser Valley';
  if (map.subterritory === 'Thompson') return 'Shuswap';
  if (map.primaryDistrict === 'Thompson and Kootenays') return 'Kootenays';
  if (map.primaryDistrict === 'Northern British Columbia') return 'Kootenays';
  return null;
}
