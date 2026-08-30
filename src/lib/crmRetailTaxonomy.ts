/** Canonical OGR CRM retail taxonomy — channels ≠ venues ≠ lifestyle themes ≠ capabilities. */

export type PrimaryRetailChannel =
  | 'apparel_specialty'
  | 'gift_novelty_souvenir'
  | 'resort_hospitality'
  | 'fishing_fly_tackle'
  | 'marine_retail'
  | 'golf_retail'
  | 'outdoor_camping_hunting'
  | 'rv_campground'
  | 'hardware_farm_rural'
  | 'country_western_workwear'
  | 'motorcycle_powersports'
  | 'automotive_garage'
  | 'tourist_attraction_cultural'
  | 'brewery_distillery_bbq'
  | 'general_country_store'
  | 'garden_lifestyle'
  | 'online_specialty'
  | 'alternative_lifestyle'
  | 'other';

export type LifestyleTheme =
  | 'fishing'
  | 'boating'
  | 'golf'
  | 'camping'
  | 'rv_travel'
  | 'retirement'
  | 'bbq'
  | 'beer'
  | 'motorcycles'
  | 'classic_cars'
  | 'trucks_garage'
  | 'surf_beach'
  | 'grandpa'
  | 'general_humor'
  | 'canadian_destination';

export type VenueContext =
  | 'downtown'
  | 'shopping_centre'
  | 'resort'
  | 'hotel'
  | 'lodge'
  | 'marina'
  | 'golf_course'
  | 'campground'
  | 'tourist_district'
  | 'highway_travel_stop'
  | 'museum_attraction'
  | 'rural_community'
  | 'online_only';

export type RetailCapability =
  | 'carries_apparel'
  | 'carries_mens_apparel'
  | 'carries_graphic_tees'
  | 'carries_giftable_apparel'
  | 'merchandises_size_runs'
  | 'displays_folded_tees'
  | 'displays_hanging_apparel'
  | 'tourism_traffic'
  | 'male_45_plus_traffic'
  | 'accepts_seasonal_prebooks'
  | 'reorder_in_season'
  | 'has_ecommerce'
  | 'multiple_locations';

export type Option<T extends string> = { value: T; label: string };

export const PRIMARY_RETAIL_CHANNELS: Option<PrimaryRetailChannel>[] = [
  { value: 'apparel_specialty', label: 'Apparel Specialty' },
  { value: 'gift_novelty_souvenir', label: 'Gift, Novelty & Souvenir' },
  { value: 'resort_hospitality', label: 'Resort & Hospitality Retail' },
  { value: 'fishing_fly_tackle', label: 'Fishing, Fly & Tackle' },
  { value: 'marine_retail', label: 'Marine Dealers, Marinas & Chandleries' },
  { value: 'golf_retail', label: 'Golf Courses, Resorts & Pro Shops' },
  { value: 'outdoor_camping_hunting', label: 'Outdoor, Camping & Hunting' },
  { value: 'rv_campground', label: 'RV & Campground Retail' },
  { value: 'hardware_farm_rural', label: 'Hardware, Farm & Rural Supply' },
  { value: 'country_western_workwear', label: 'Country, Western & Workwear' },
  { value: 'motorcycle_powersports', label: 'Motorcycle & Powersports' },
  { value: 'automotive_garage', label: 'Automotive & Garage Lifestyle' },
  { value: 'tourist_attraction_cultural', label: 'Tourist Attraction & Cultural Retail' },
  { value: 'brewery_distillery_bbq', label: 'Brewery, Distillery & BBQ Retail' },
  { value: 'general_country_store', label: 'General & Country Store' },
  { value: 'garden_lifestyle', label: 'Garden & Lifestyle Centre' },
  { value: 'online_specialty', label: 'Online Specialty Retailer' },
  { value: 'alternative_lifestyle', label: 'Alternative Lifestyle Retail' },
  { value: 'other', label: 'Other' },
];

export const LIFESTYLE_THEMES: Option<LifestyleTheme>[] = [
  { value: 'fishing', label: 'Fishing' },
  { value: 'boating', label: 'Boating' },
  { value: 'golf', label: 'Golf' },
  { value: 'camping', label: 'Camping' },
  { value: 'rv_travel', label: 'RV Travel' },
  { value: 'retirement', label: 'Retirement' },
  { value: 'bbq', label: 'BBQ' },
  { value: 'beer', label: 'Beer' },
  { value: 'motorcycles', label: 'Motorcycles' },
  { value: 'classic_cars', label: 'Classic Cars' },
  { value: 'trucks_garage', label: 'Trucks and Garage' },
  { value: 'surf_beach', label: 'Surf and Beach' },
  { value: 'grandpa', label: 'Grandpa' },
  { value: 'general_humor', label: 'General Humor' },
  { value: 'canadian_destination', label: 'Canadian/Destination' },
];

export const VENUE_CONTEXTS: Option<VenueContext>[] = [
  { value: 'downtown', label: 'Downtown' },
  { value: 'shopping_centre', label: 'Shopping Centre' },
  { value: 'resort', label: 'Resort' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'lodge', label: 'Lodge' },
  { value: 'marina', label: 'Marina' },
  { value: 'golf_course', label: 'Golf Course' },
  { value: 'campground', label: 'Campground' },
  { value: 'tourist_district', label: 'Tourist District' },
  { value: 'highway_travel_stop', label: 'Highway/Travel Stop' },
  { value: 'museum_attraction', label: 'Museum/Attraction' },
  { value: 'rural_community', label: 'Rural Community' },
  { value: 'online_only', label: 'Online Only' },
];

export const RETAIL_CAPABILITIES: Option<RetailCapability>[] = [
  { value: 'carries_apparel', label: 'Carries Apparel' },
  { value: 'carries_mens_apparel', label: "Carries Men's Apparel" },
  { value: 'carries_graphic_tees', label: 'Carries Graphic Tees' },
  { value: 'carries_giftable_apparel', label: 'Carries Giftable Apparel' },
  { value: 'merchandises_size_runs', label: 'Merchandises Size Runs' },
  { value: 'displays_folded_tees', label: 'Can Display Folded Tees' },
  { value: 'displays_hanging_apparel', label: 'Can Display Hanging Apparel' },
  { value: 'tourism_traffic', label: 'Has Tourism Traffic' },
  { value: 'male_45_plus_traffic', label: 'Has Male 45+ Traffic' },
  { value: 'accepts_seasonal_prebooks', label: 'Accepts Seasonal Prebooks' },
  { value: 'reorder_in_season', label: 'Can Reorder In Season' },
  { value: 'has_ecommerce', label: 'Has Ecommerce' },
  { value: 'multiple_locations', label: 'Multiple Locations' },
];

export const SUBCHANNELS_BY_PRIMARY: Record<PrimaryRetailChannel, Option<string>[]> = {
  apparel_specialty: [
    { value: 'mens_clothing', label: "Men's Clothing" },
    { value: 'family_clothing', label: 'Family Clothing' },
    { value: 'casual_lifestyle_apparel', label: 'Casual Lifestyle Apparel' },
    { value: 'graphic_tshirts', label: 'Graphic T-Shirts' },
    { value: 'surf_skate_apparel', label: 'Surf/Skate Apparel' },
    { value: 'western_wear', label: 'Western Wear' },
    { value: 'workwear', label: 'Workwear' },
    { value: 'destination_apparel', label: 'Destination Apparel' },
    { value: 'big_tall', label: 'Big & Tall' },
  ],
  gift_novelty_souvenir: [
    { value: 'independent_gift', label: 'Independent Gift Shop' },
    { value: 'destination_apparel', label: 'Destination Apparel' },
    { value: 'souvenir_store', label: 'Souvenir Store' },
    { value: 'greeting_card_gift', label: 'Greeting-Card / Gift Store' },
  ],
  resort_hospitality: [
    { value: 'resort_boutique', label: 'Resort Boutique' },
    { value: 'hotel_shop', label: 'Hotel Shop' },
    { value: 'lodge_store', label: 'Lodge Store' },
    { value: 'fishing_lodge', label: 'Fishing Lodge' },
    { value: 'ski_resort', label: 'Ski Resort' },
    { value: 'vacation_property', label: 'Vacation Property' },
  ],
  fishing_fly_tackle: [
    { value: 'general_tackle', label: 'General Tackle' },
    { value: 'fly_fishing', label: 'Fly Fishing' },
    { value: 'fishing_outfitter', label: 'Fishing Outfitter' },
    { value: 'fishing_lodge', label: 'Fishing Lodge' },
    { value: 'charter_operator', label: 'Charter Operator' },
    { value: 'marine_fishing', label: 'Marine Fishing' },
    { value: 'hunting_fishing_combo', label: 'Hunting and Fishing Combination' },
  ],
  marine_retail: [
    { value: 'marina_chandlery', label: 'Marina / Chandlery' },
    { value: 'boat_supply', label: 'Boat-Supply Store' },
    { value: 'marine_dealership', label: 'Marine Dealership' },
    { value: 'yacht_club_shop', label: 'Yacht-Club Shop' },
  ],
  golf_retail: [
    { value: 'course_pro_shop', label: 'Golf-Course Pro Shop' },
    { value: 'golf_resort', label: 'Golf Resort' },
    { value: 'independent_golf', label: 'Independent Golf Retailer' },
    { value: 'country_club_shop', label: 'Country-Club Shop' },
  ],
  outdoor_camping_hunting: [
    { value: 'outdoor_store', label: 'Outdoor Store' },
    { value: 'camping_retailer', label: 'Camping Retailer' },
    { value: 'hunting_shop', label: 'Hunting Shop' },
    { value: 'outfitter_store', label: 'Outfitter Store' },
  ],
  rv_campground: [
    { value: 'rv_dealership', label: 'RV Dealership' },
    { value: 'rv_resort', label: 'RV Resort' },
    { value: 'campground_store', label: 'Campground Store' },
    { value: 'travel_centre', label: 'Travel Centre' },
  ],
  hardware_farm_rural: [
    { value: 'independent_hardware', label: 'Independent Hardware' },
    { value: 'farm_supply', label: 'Farm Supply' },
    { value: 'ranch_supply', label: 'Ranch Supply' },
    { value: 'feed_store', label: 'Feed Store' },
    { value: 'coop_with_apparel', label: 'Co-op with Apparel' },
  ],
  country_western_workwear: [
    { value: 'western_wear_store', label: 'Western-Wear Store' },
    { value: 'country_lifestyle', label: 'Country Lifestyle Store' },
    { value: 'workwear_retailer', label: 'Workwear Retailer' },
  ],
  motorcycle_powersports: [
    { value: 'motorcycle_dealership', label: 'Motorcycle Dealership' },
    { value: 'motorcycle_apparel', label: 'Motorcycle Apparel Store' },
    { value: 'powersports_retailer', label: 'Powersports Retailer' },
  ],
  automotive_garage: [
    { value: 'classic_car_museum', label: 'Classic-Car Museum' },
    { value: 'speed_shop', label: 'Speed Shop' },
    { value: 'auto_lifestyle', label: 'Automotive Lifestyle Store' },
    { value: 'garage_themed', label: 'Garage-Themed Retail' },
  ],
  tourist_attraction_cultural: [
    { value: 'museum_store', label: 'Museum Store' },
    { value: 'heritage_site', label: 'Heritage Site' },
    { value: 'visitor_attraction', label: 'Visitor Attraction' },
    { value: 'park_store', label: 'Park Store' },
    { value: 'interpretive_centre', label: 'Interpretive Centre' },
  ],
  brewery_distillery_bbq: [
    { value: 'brewery_taproom', label: 'Brewery Taproom' },
    { value: 'distillery', label: 'Distillery' },
    { value: 'bbq_grill_store', label: 'BBQ / Grill Store' },
    { value: 'beer_themed_gift', label: 'Beer-Themed Gift Retail' },
  ],
  general_country_store: [
    { value: 'independent_general', label: 'Independent General Store' },
    { value: 'rural_department', label: 'Rural Department Store' },
    { value: 'trading_post', label: 'Trading Post' },
  ],
  garden_lifestyle: [
    { value: 'garden_centre_gift_apparel', label: 'Garden Centre with Gift/Apparel' },
  ],
  online_specialty: [{ value: 'canadian_ecommerce', label: 'Independent Canadian Ecommerce' }],
  alternative_lifestyle: [
    { value: 'barbershop', label: 'Barbershop' },
    { value: 'retirement_community_shop', label: 'Retirement-Community Shop' },
    { value: 'mens_grooming', label: "Men's Grooming Store" },
  ],
  other: [{ value: 'other_sub', label: 'Other' }],
};

const PRIMARY_SET = new Set(PRIMARY_RETAIL_CHANNELS.map((o) => o.value));
const THEME_SET = new Set(LIFESTYLE_THEMES.map((o) => o.value));
const VENUE_SET = new Set(VENUE_CONTEXTS.map((o) => o.value));
const CAP_SET = new Set(RETAIL_CAPABILITIES.map((o) => o.value));

const PRIMARY_LABEL = Object.fromEntries(
  PRIMARY_RETAIL_CHANNELS.map((o) => [o.value, o.label]),
) as Record<PrimaryRetailChannel, string>;
const THEME_LABEL = Object.fromEntries(LIFESTYLE_THEMES.map((o) => [o.value, o.label])) as Record<
  LifestyleTheme,
  string
>;

/** Legacy CRM category values (pre-taxonomy migration). */
export type LegacyProspectCategory = 'Golf' | 'Marina' | 'Hardware' | 'Resort Gift';

const LEGACY_TO_PRIMARY: Record<LegacyProspectCategory, PrimaryRetailChannel> = {
  Golf: 'golf_retail',
  Marina: 'marine_retail',
  Hardware: 'hardware_farm_rural',
  'Resort Gift': 'gift_novelty_souvenir',
};

export function isPrimaryRetailChannel(value: string): value is PrimaryRetailChannel {
  return PRIMARY_SET.has(value as PrimaryRetailChannel);
}

export function isLifestyleTheme(value: string): value is LifestyleTheme {
  return THEME_SET.has(value as LifestyleTheme);
}

export function primaryRetailChannelLabel(value: string): string {
  if (isPrimaryRetailChannel(value)) return PRIMARY_LABEL[value];
  if (value in LEGACY_TO_PRIMARY)
    return PRIMARY_LABEL[LEGACY_TO_PRIMARY[value as LegacyProspectCategory]];
  return value;
}

/** Normalize Briefing/prep channel filter (`ALL` / blank → null). */
export function normalizePrepChannel(
  channel: string | null | undefined,
): PrimaryRetailChannel | null {
  const v = channel?.trim();
  if (!v || v === 'ALL') return null;
  if (isPrimaryRetailChannel(v)) return v;
  if (v in LEGACY_TO_PRIMARY) return LEGACY_TO_PRIMARY[v as LegacyProspectCategory];
  return null;
}

/** True when prospect/draft channel matches a prep channel filter (null filter = all). */
export function prospectMatchesPrepChannel(
  categoryOrChannel: string | null | undefined,
  channel: PrimaryRetailChannel | null,
): boolean {
  if (!channel) return true;
  return normalizePrepChannel(categoryOrChannel) === channel;
}

export function lifestyleThemeLabel(value: string): string {
  if (isLifestyleTheme(value)) return THEME_LABEL[value];
  return value;
}

export function normalizePrimaryChannels(values: readonly string[]): PrimaryRetailChannel[] {
  const set = new Set<PrimaryRetailChannel>();
  for (const raw of values) {
    const v = raw.trim();
    if (isPrimaryRetailChannel(v)) set.add(v);
    else if (v in LEGACY_TO_PRIMARY) set.add(LEGACY_TO_PRIMARY[v as LegacyProspectCategory]);
  }
  return PRIMARY_RETAIL_CHANNELS.map((o) => o.value).filter((v) => set.has(v));
}

export function normalizeLifestyleThemes(values: readonly string[]): LifestyleTheme[] {
  const set = new Set<LifestyleTheme>();
  for (const raw of values) {
    const v = raw.trim();
    if (isLifestyleTheme(v)) set.add(v);
  }
  return LIFESTYLE_THEMES.map((o) => o.value).filter((v) => set.has(v));
}

export function normalizeVenueContexts(values: readonly string[]): VenueContext[] {
  const set = new Set<VenueContext>();
  for (const raw of values) {
    const v = raw.trim();
    if (VENUE_SET.has(v as VenueContext)) set.add(v as VenueContext);
  }
  return VENUE_CONTEXTS.map((o) => o.value).filter((v) => set.has(v));
}

export function normalizeRetailCapabilities(values: readonly string[]): RetailCapability[] {
  const set = new Set<RetailCapability>();
  for (const raw of values) {
    const v = raw.trim();
    if (CAP_SET.has(v as RetailCapability)) set.add(v as RetailCapability);
  }
  return RETAIL_CAPABILITIES.map((o) => o.value).filter((v) => set.has(v));
}

export function clampSecondaryChannels(
  primary: PrimaryRetailChannel | null | undefined,
  secondary: readonly string[],
  max = 3,
): PrimaryRetailChannel[] {
  return normalizePrimaryChannels(secondary)
    .filter((c) => c !== primary)
    .slice(0, max);
}

export function subchannelOptionsFor(
  primary: PrimaryRetailChannel | null | undefined,
  secondary: readonly PrimaryRetailChannel[] = [],
): Option<string>[] {
  const keys = [primary, ...secondary].filter((k): k is PrimaryRetailChannel => Boolean(k));
  const seen = new Set<string>();
  const out: Option<string>[] = [];
  for (const key of keys) {
    for (const opt of SUBCHANNELS_BY_PRIMARY[key] ?? []) {
      if (seen.has(opt.value)) continue;
      seen.add(opt.value);
      out.push(opt);
    }
  }
  return out;
}

export function normalizeSubchannels(
  values: readonly string[],
  allowed: readonly Option<string>[],
): string[] {
  const allow = new Set(allowed.map((o) => o.value));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = raw.trim();
    if (!allow.has(v) || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** Map legacy category or new primary code → primary. */
export function coercePrimaryRetailChannel(raw: string | null | undefined): PrimaryRetailChannel {
  const v = (raw ?? '').trim();
  if (isPrimaryRetailChannel(v)) return v;
  if (v in LEGACY_TO_PRIMARY) return LEGACY_TO_PRIMARY[v as LegacyProspectCategory];
  return 'other';
}

/** Prefer retail_category sheet labels when mapping legacy rows. */
export function primaryFromRetailCategory(
  retailCategory: string | null | undefined,
  legacyCategory: string | null | undefined,
): PrimaryRetailChannel {
  const rc = (retailCategory ?? '').trim().toLowerCase();
  if (rc.includes('golf')) return 'golf_retail';
  if (rc.includes('marina') || rc.includes('marine')) return 'marine_retail';
  if (rc.includes('fishing') || rc.includes('tackle') || rc.includes('fly'))
    return 'fishing_fly_tackle';
  if (rc.includes('outdoor') || rc.includes('camping') || rc.includes('hunting'))
    return 'outdoor_camping_hunting';
  if (rc.includes('hardware') || rc.includes('farm')) return 'hardware_farm_rural';
  if (rc.includes('resort') || rc.includes('lodge') || rc.includes('hotel'))
    return 'resort_hospitality';
  if (rc.includes('gift') || rc.includes('tourist') || rc.includes('souvenir'))
    return 'gift_novelty_souvenir';
  if (rc.includes('apparel') || rc.includes('clothing') || rc.includes('mens'))
    return 'apparel_specialty';
  if (rc.includes('rv')) return 'rv_campground';
  return coercePrimaryRetailChannel(legacyCategory);
}

type ThemeRule = { theme: LifestyleTheme; needles: string[] };

export const LIFESTYLE_THEME_INFER_RULES: ThemeRule[] = [
  { theme: 'golf', needles: ['golf', 'swing', 'fairway', 'best round', '19th hole', 'putt'] },
  {
    theme: 'fishing',
    needles: ['fish', 'hookin', 'reel', 'tackle', 'chasing tail', 'catch'],
  },
  {
    theme: 'boating',
    needles: ['boat', 'marina', 'sail', 'dock', 'pirate', 'mariner', 'salty', 'captain'],
  },
  { theme: 'camping', needles: ['camp', 'camper', 'tent', 'trail'] },
  { theme: 'rv_travel', needles: ['rv', 'motorhome', 'how i roll'] },
  {
    theme: 'retirement',
    needles: ['retirement', 'retired', 'getting older', 'decades', 'aged', 'classic'],
  },
  { theme: 'bbq', needles: ['grill', 'bbq', 'barbecue'] },
  { theme: 'beer', needles: ['beer', 'brew', 'ale', 'lager'] },
  { theme: 'motorcycles', needles: ['motorcycl', 'chopper', 'harley', 'ride', 'gears'] },
  { theme: 'classic_cars', needles: ['muscle', 'shelby', 'classic car', 'hot rod'] },
  {
    theme: 'trucks_garage',
    needles: ['truck', 'garage', 'wrench', 'octane', 'roadhouse', 'built not bought', 'camo'],
  },
  {
    theme: 'surf_beach',
    needles: ['surf', 'beach', 'hammock', 'palm', 'vacation', 'aloha', 'island', 'cruiser'],
  },
  { theme: 'grandpa', needles: ['grandpa', 'grandad', 'gramps'] },
  {
    theme: 'general_humor',
    needles: ['look good', 'glasses', 'legend', 'expert', 'dream', 'bucket list', 'disgracefully'],
  },
  {
    theme: 'canadian_destination',
    needles: [
      'canada',
      'canadian',
      'maple',
      'destination',
      'freedom',
      'usa',
      'born',
      'flag',
      'veteran',
    ],
  },
];

export function inferLifestyleThemesFromCopy(parts: {
  name?: string | null;
  tagline?: string | null;
  description?: string | null;
}): LifestyleTheme[] {
  const hay = [parts.name, parts.tagline, parts.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!hay.trim()) return ['general_humor'];
  const matched: LifestyleTheme[] = [];
  for (const rule of LIFESTYLE_THEME_INFER_RULES) {
    if (rule.needles.some((n) => hay.includes(n))) matched.push(rule.theme);
  }
  const normalized = normalizeLifestyleThemes(matched);
  return normalized.length > 0 ? normalized : ['general_humor'];
}

export function effectiveLifestyleThemes(parts: {
  lifestyleThemes?: readonly string[] | null;
  name?: string | null;
  tagline?: string | null;
  description?: string | null;
}): LifestyleTheme[] {
  const stored = normalizeLifestyleThemes(parts.lifestyleThemes ?? []);
  if (stored.length > 0) return stored;
  return inferLifestyleThemesFromCopy(parts);
}

/** Map old CRM product tags → recommended primary channels. */
export function recommendedChannelsFromLegacyTags(tags: readonly string[]): PrimaryRetailChannel[] {
  return normalizePrimaryChannels(tags);
}

export const MAX_SECONDARY_CHANNELS = 3;
export const MAX_RECOMMENDED_CHANNELS = 3;
export const BEST_SELLER_BADGE_MAX_RANK = 32;
