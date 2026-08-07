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

export function isRetailChannel(value: string): value is RetailChannel {
  return CHANNEL_SET.has(value);
}

/** Keep known CRM channels, de-dupe, preserve option order. */
export function normalizeRetailChannels(values: readonly string[]): RetailChannel[] {
  const set = new Set<RetailChannel>();
  for (const raw of values) {
    const v = raw.trim();
    if (isRetailChannel(v)) set.add(v);
  }
  return RETAIL_CHANNEL_OPTIONS.map((o) => o.value).filter((v) => set.has(v));
}

export function retailChannelLabel(value: string): string {
  if (isRetailChannel(value)) return LABEL_BY_VALUE[value];
  return value;
}

type ChannelRule = { channel: RetailChannel; needles: string[] };

/** Keyword rules shared with the OGR backfill migration (keep in sync). */
export const RETAIL_CHANNEL_INFER_RULES: ChannelRule[] = [
  {
    channel: 'Golf',
    needles: ['golf', 'fairway', 'tee time', 'links', 'still swing', 'swinging'],
  },
  {
    channel: 'Marina',
    needles: ['boat', 'marina', 'dock', 'sail', 'fish', 'tackle', 'lake', 'ocean', 'beach cruiser'],
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
      'freedom',
      'born',
    ],
  },
];

/**
 * Infer CRM retail channels from garment copy for backfill heuristics / tests.
 * A style may match multiple channels.
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
  if (!hay.trim()) return [];

  const matched: RetailChannel[] = [];
  for (const rule of RETAIL_CHANNEL_INFER_RULES) {
    if (rule.needles.some((n) => hay.includes(n))) matched.push(rule.channel);
  }
  return normalizeRetailChannels(matched);
}
