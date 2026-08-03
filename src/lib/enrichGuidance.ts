/** Shared CRM channel mapping for AI research + structured enrichment. */
export const CATEGORY_MAPPING_GUIDANCE = [
  'CRM category must be exactly one of: Golf, Marina, Hardware, Resort Gift.',
  'Map by what the store actually sells (from the official website / research), not by the word "Sports" in the name:',
  '- Golf courses, golf pro shops, golf specialty retailers → Golf',
  '- Marinas, boat dealers, marine chandleries → Marina',
  '- Hardware co-ops, building centres, workwear, hunting/fishing/shooting specialty, outdoor sporting-goods (firearms, tackle, ammo, reloading) → Hardware',
  '- Resort gift shops and tourism boutiques → Resort Gift',
  'Never map hunting, fishing, or shooting specialty retailers to Golf.',
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
