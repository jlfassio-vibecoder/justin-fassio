/**
 * Pure geo + ICP filters for opening Living In Sunshine RLAs
 * on Go Hammock–fit OGR directory prospects.
 */

import type { PrimaryRetailChannel, VenueContext } from '@/lib/crmRetailTaxonomy';
import { normalizePrimaryChannels, normalizeVenueContexts } from '@/lib/crmRetailTaxonomy';

export const LISS_TERRITORY_CODES = ['bc', 'or', 'wa', 'ca'] as const;

export type LissTerritoryCode = (typeof LISS_TERRITORY_CODES)[number];

/** CA CRM regions north of Orange County (always included). */
export const LISS_CA_INCLUDED_REGIONS = new Set([
  'NorCal Coastal',
  'NorCal Inland',
  'Central Coast / LA North',
]);

/** CA CRM regions entirely south of the LIS southern bound. */
export const LISS_CA_EXCLUDED_REGIONS = new Set(['Inland Empire / San Diego']);

/** LA basin region — include only when not Orange County. */
export const LISS_CA_CONDITIONAL_REGION = 'LA Metro / OC';

/** Orange County ZIP3 prefixes (northern OC edge = southern LIS bound). */
export const LISS_OC_ZIP3_PREFIXES = new Set(['926', '927', '928']);

/** San Diego / far-south ZIP3 prefixes to exclude on statewide CA leftovers. */
export const LISS_CA_SOUTH_ZIP3_PREFIXES = new Set([
  '919',
  '920',
  '921',
  '922',
  '923',
  '924',
  '925',
  '926',
  '927',
  '928',
]);

/** Common Orange County city names (normalized lowercase). */
export const LISS_OC_CITY_DENYLIST = new Set(
  [
    'anaheim',
    'anaheim hills',
    'brea',
    'buena park',
    'costa mesa',
    'cypress',
    'dana point',
    'fountain valley',
    'fullerton',
    'garden grove',
    'huntington beach',
    'irvine',
    'la habra',
    'la palma',
    'laguna beach',
    'laguna hills',
    'laguna niguel',
    'laguna woods',
    'lake forest',
    'los alamitos',
    'mission viejo',
    'newport beach',
    'orange',
    'placentia',
    'rancho santa margarita',
    'san clemente',
    'san juan capistrano',
    'santa ana',
    'seal beach',
    'stanton',
    'tustin',
    'villa park',
    'westminster',
    'yorba linda',
  ].map((c) => c.toLowerCase()),
);

/** Inland Empire / San Diego city names for statewide CA leftover filtering. */
export const LISS_CA_SOUTH_CITY_DENYLIST = new Set(
  [
    ...LISS_OC_CITY_DENYLIST,
    'san diego',
    'la jolla',
    'carlsbad',
    'oceanside',
    'encinitas',
    'escondido',
    'chula vista',
    'riverside',
    'san bernardino',
    'ontario',
    'corona',
    'temecula',
    'murrieta',
    'palm springs',
    'palm desert',
  ].map((c) => c.toLowerCase()),
);

export const LISS_HAMMOCK_CHANNELS = new Set<PrimaryRetailChannel>([
  'outdoor_camping_hunting',
  'gift_novelty_souvenir',
  'resort_hospitality',
  'marine_retail',
  'apparel_specialty',
  'tourist_attraction_cultural',
  'rv_campground',
  'general_country_store',
]);

export const LISS_HAMMOCK_VENUES = new Set<VenueContext>([
  'tourist_district',
  'campground',
  'marina',
  'resort',
  'highway_travel_stop',
]);

export type LissFitProspectInput = {
  territoryCode: string | null | undefined;
  region: string | null | undefined;
  city?: string | null | undefined;
  postalCode?: string | null | undefined;
  category?: string | null | undefined;
  secondaryChannels?: unknown;
  lifestyleThemes?: unknown;
  venueContexts?: unknown;
  accountStatus?: string | null | undefined;
};

function normalizeCityKey(city: string | null | undefined): string {
  return (city ?? '').trim().toLowerCase();
}

function postalZip3(postalCode: string | null | undefined): string | null {
  const digits = (postalCode ?? '').replace(/\D/g, '');
  if (digits.length < 3) return null;
  return digits.slice(0, 3);
}

export function isOrangeCountyLocation(input: {
  city?: string | null;
  postalCode?: string | null;
}): boolean {
  const city = normalizeCityKey(input.city);
  if (city && LISS_OC_CITY_DENYLIST.has(city)) return true;
  const zip3 = postalZip3(input.postalCode);
  if (zip3 && LISS_OC_ZIP3_PREFIXES.has(zip3)) return true;
  return false;
}

export function isSouthOfOcCaliforniaLeftover(input: {
  city?: string | null;
  postalCode?: string | null;
}): boolean {
  const city = normalizeCityKey(input.city);
  if (city && LISS_CA_SOUTH_CITY_DENYLIST.has(city)) return true;
  const zip3 = postalZip3(input.postalCode);
  if (zip3 && LISS_CA_SOUTH_ZIP3_PREFIXES.has(zip3)) return true;
  return false;
}

/** Geo gate: BC/OR/WA all regions; CA from northern OC edge north. */
export function prospectFitsLissHammockGeo(input: LissFitProspectInput): boolean {
  const code = (input.territoryCode ?? '').trim().toLowerCase();
  if (!(LISS_TERRITORY_CODES as readonly string[]).includes(code)) return false;

  if (code === 'bc' || code === 'or' || code === 'wa') return true;

  // ca
  const region = (input.region ?? '').trim();
  if (LISS_CA_EXCLUDED_REGIONS.has(region)) return false;
  if (LISS_CA_INCLUDED_REGIONS.has(region)) return true;
  if (region === LISS_CA_CONDITIONAL_REGION) {
    return !isOrangeCountyLocation({ city: input.city, postalCode: input.postalCode });
  }
  // Statewide leftover / blank region: only when clearly not south of OC.
  if (!region || region === 'California') {
    return !isSouthOfOcCaliforniaLeftover({ city: input.city, postalCode: input.postalCode });
  }
  return false;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

/** ICP gate: surf/beach themes, outdoor/gift/resort channels, or tourist venues. */
export function prospectFitsLissHammockIcp(input: LissFitProspectInput): boolean {
  const themes = asStringArray(input.lifestyleThemes).map((t) => t.trim().toLowerCase());
  if (themes.includes('surf_beach')) return true;

  const primary = (input.category ?? '').trim();
  const channels = normalizePrimaryChannels([primary, ...asStringArray(input.secondaryChannels)]);
  if (channels.some((c) => LISS_HAMMOCK_CHANNELS.has(c))) return true;

  const venues = normalizeVenueContexts(asStringArray(input.venueContexts));
  if (venues.some((v) => LISS_HAMMOCK_VENUES.has(v))) return true;

  return false;
}

/** Directory-eligible account statuses for opening a fresh LIS prospect RLA. */
export function prospectEligibleForLissRlaOpen(input: LissFitProspectInput): boolean {
  const status = (input.accountStatus ?? '').trim().toLowerCase();
  if (!status) return true;
  if (status === 'inactive' || status === 'do_not_contact' || status === 'closed') return false;
  return true;
}

export function prospectFitsLissHammockOpen(input: LissFitProspectInput): boolean {
  return (
    prospectEligibleForLissRlaOpen(input) &&
    prospectFitsLissHammockGeo(input) &&
    prospectFitsLissHammockIcp(input)
  );
}

export function compareLissFitRank(
  a: { fitScore: number | null; priority: string | null },
  b: { fitScore: number | null; priority: string | null },
): number {
  const af = a.fitScore ?? -1;
  const bf = b.fitScore ?? -1;
  if (bf !== af) return bf - af;
  return (a.priority ?? '').localeCompare(b.priority ?? '');
}
