import type { ProspectCategory } from '@/lib/prospects';

/** CRM retail channel codes stored on catalog_items.lifestyle_themes. */
export type RetailChannel = ProspectCategory;

export const RETAIL_CHANNEL_OPTIONS: { value: RetailChannel; label: string }[] = [
  { value: 'Golf', label: 'Golf Pro Shops' },
  { value: 'Marina', label: 'Marinas & Boat Stores' },
  { value: 'Hardware', label: 'Hardware Dealers & Co-ops' },
  { value: 'Resort Gift', label: 'Resort Gift Boutiques' },
];

/** Absolute sales ranks in this range show `#N best seller`; below that, theme pills. */
export const BEST_SELLER_BADGE_MAX_RANK = 32;

const CHANNEL_SET = new Set<string>(RETAIL_CHANNEL_OPTIONS.map((o) => o.value));

const LABEL_BY_VALUE = Object.fromEntries(
  RETAIL_CHANNEL_OPTIONS.map((o) => [o.value, o.label]),
) as Record<RetailChannel, string>;

const VALUE_BY_LABEL = Object.fromEntries(
  RETAIL_CHANNEL_OPTIONS.map((o) => [o.label, o.value]),
) as Record<string, RetailChannel>;

export function isRetailChannel(value: string): value is RetailChannel {
  return CHANNEL_SET.has(value);
}

/** Keep known CRM channels, de-dupe, preserve option order. */
export function normalizeRetailChannels(values: readonly string[]): RetailChannel[] {
  const set = new Set<RetailChannel>();
  for (const raw of values) {
    const v = raw.trim();
    if (isRetailChannel(v)) set.add(v);
    else if (VALUE_BY_LABEL[v]) set.add(VALUE_BY_LABEL[v]);
  }
  return RETAIL_CHANNEL_OPTIONS.map((o) => o.value).filter((v) => set.has(v));
}

export function retailChannelLabel(value: string): string {
  if (isRetailChannel(value)) return LABEL_BY_VALUE[value];
  return value;
}

/** Resolve filter option values that may be codes or display labels. */
export function resolveRetailChannelFilter(theme: string): RetailChannel | null {
  const t = theme.trim();
  if (!t) return null;
  if (isRetailChannel(t)) return t;
  return VALUE_BY_LABEL[t] ?? null;
}

type ChannelRule = { channel: RetailChannel; needles: string[] };

/** Keyword rules shared with the OGR backfill migration (keep in sync). */
export const RETAIL_CHANNEL_INFER_RULES: ChannelRule[] = [
  {
    channel: 'Golf',
    needles: [
      'golf',
      'fairway',
      'tee time',
      'links',
      'still swing',
      'swinging',
      'best round',
      '19th hole',
      'nineteenth hole',
      'putt',
      'par ',
      'birdie',
    ],
  },
  {
    channel: 'Marina',
    needles: [
      'boat',
      'marina',
      'dock',
      'sail',
      'fish',
      'tackle',
      'lake',
      'ocean',
      'beach cruiser',
      'hookin',
      'hooking',
      'reel',
      'chasing tail',
      'pirate',
      'mariner',
      'crab',
      'surf',
      'salty',
      'anchor',
      'captain',
      'harbor',
      'harbour',
    ],
  },
  {
    channel: 'Hardware',
    needles: [
      'truck',
      'wrench',
      'farm',
      'garage',
      'workaholic',
      'beer',
      'grill',
      'bbq',
      'muscle',
      'dog',
      'lab ',
      'veteran',
      'flag',
      'usa',
      'octane',
      'iron &',
      'built not bought',
      'camo',
      'roadhouse',
      'poker',
      'oak cask',
      'crazy beer',
      'leash',
      'how i roll',
      'ride',
      'gears',
      'road',
      'king of road',
      'big red',
      'shelby',
      'muscle',
    ],
  },
  {
    channel: 'Resort Gift',
    needles: [
      'vacation',
      'hammock',
      'palm',
      'beach',
      'retirement',
      'grandpa',
      'classic',
      'getting older',
      'decades',
      'aged',
      'perfection',
      'living legend',
      'local legend',
      'look good',
      'glasses',
      'opv',
      'american dream',
      'american revival',
      'american legend',
      'freedom',
      'born',
      'bucket list',
      'dream',
      'aloha',
      'island',
      'camper',
      'lounge',
      'legend',
      'older',
      'better i was',
      'rock',
      'disgracefully',
      'expert',
      'beanie',
      'dad cap',
      'mug',
      'magnet',
      'metal sign',
      'sticker',
    ],
  },
];

/**
 * Infer CRM retail channels from garment copy for backfill / client fallback.
 * Falls back to Resort Gift when nothing matches so every style is filterable.
 */
export function inferRetailChannelsFromCopy(parts: {
  name?: string | null;
  tagline?: string | null;
  description?: string | null;
}): RetailChannel[] {
  const hay = [parts.name, parts.tagline, parts.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!hay.trim()) return ['Resort Gift'];

  const matched: RetailChannel[] = [];
  for (const rule of RETAIL_CHANNEL_INFER_RULES) {
    if (rule.needles.some((n) => hay.includes(n))) matched.push(rule.channel);
  }
  const normalized = normalizeRetailChannels(matched);
  return normalized.length > 0 ? normalized : ['Resort Gift'];
}

/** Prefer persisted themes; otherwise infer from name/tagline/description. */
export function effectiveRetailChannels(parts: {
  lifestyleThemes?: readonly string[] | null;
  name?: string | null;
  tagline?: string | null;
  description?: string | null;
}): RetailChannel[] {
  const stored = normalizeRetailChannels(parts.lifestyleThemes ?? []);
  if (stored.length > 0) return stored;
  return inferRetailChannelsFromCopy(parts);
}
