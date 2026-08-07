/** Shared CRM channel mapping for AI research + structured enrichment. */
export const CATEGORY_MAPPING_GUIDANCE = [
  'CRM category (primary retail channel) must be exactly one of these codes:',
  'apparel_specialty, gift_novelty_souvenir, resort_hospitality, fishing_fly_tackle, marine_retail, golf_retail, outdoor_camping_hunting, rv_campground, hardware_farm_rural, country_western_workwear, motorcycle_powersports, automotive_garage, tourist_attraction_cultural, brewery_distillery_bbq, general_country_store, garden_lifestyle, online_specialty, alternative_lifestyle, other.',
  'Map by what the store actually sells (from the official website / research):',
  '- Men’s / family / graphic tee / surf-skate apparel shops → apparel_specialty',
  '- Independent gift / souvenir → gift_novelty_souvenir',
  '- Resort / hotel / lodge shops → resort_hospitality',
  '- Tackle / fly shops / fishing outfitters → fishing_fly_tackle',
  '- Marinas, boat dealers, chandleries → marine_retail',
  '- Golf courses, pro shops, golf resorts → golf_retail',
  '- Outdoor / camping / hunting → outdoor_camping_hunting',
  '- Hardware / farm / ranch / co-ops with apparel; hunting/fishing/shooting specialty when farm-supply adjacent → hardware_farm_rural or fishing_fly_tackle / outdoor_camping_hunting',
  'Never map hunting or fishing specialty to golf_retail.',
  'Do not use venue (resort, marina) as the primary channel when the buyer is an apparel boutique inside that venue — prefer apparel_specialty and set venue separately when known.',
].join('\n');

/** Extract hostname from a URL for search guidance; returns null if invalid. */
export function hostnameFromUrl(url: string): string | null {
  try {
    const host = new URL(url.trim()).hostname.replace(/^www\./i, '');
    return host || null;
  } catch {
    return null;
  }
}
