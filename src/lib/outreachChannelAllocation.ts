import { PRIMARY_RETAIL_CHANNELS, type PrimaryRetailChannel } from '@/lib/crmRetailTaxonomy';

export type AllocateChannelsForDayInput = {
  /** YYYY-MM-DD local preparation date (used later for weighted rotation). */
  preparationDate: string;
  capacity: number;
  weights?: Partial<Record<PrimaryRetailChannel, number>>;
};

export type AllocateChannelsForDayResult = {
  channelOrder: PrimaryRetailChannel[];
  slotsByChannel: Record<string, number>;
};

const CHANNEL_VALUES = PRIMARY_RETAIL_CHANNELS.map((o) => o.value);

/**
 * Stub channel allocator for Phase 1 / Phase 5 prep.
 * Without weights: round-robin capacity across PRIMARY_RETAIL_CHANNELS.
 * With weights: proportional slots (minimum 0); remainder round-robins by weight desc then channelOrder.
 */
export function allocateChannelsForDay(
  input: AllocateChannelsForDayInput,
): AllocateChannelsForDayResult {
  const capacity = Math.max(0, Math.floor(input.capacity));
  const slotsByChannel: Record<string, number> = {};
  for (const ch of CHANNEL_VALUES) {
    slotsByChannel[ch] = 0;
  }

  if (capacity === 0) {
    return { channelOrder: [...CHANNEL_VALUES], slotsByChannel };
  }

  const weights = input.weights;
  const hasWeights =
    weights != null &&
    CHANNEL_VALUES.some((ch) => typeof weights[ch] === 'number' && (weights[ch] as number) > 0);

  if (!hasWeights) {
    for (let i = 0; i < capacity; i++) {
      const ch = CHANNEL_VALUES[i % CHANNEL_VALUES.length];
      slotsByChannel[ch] = (slotsByChannel[ch] ?? 0) + 1;
    }
    return { channelOrder: [...CHANNEL_VALUES], slotsByChannel };
  }

  const positive = CHANNEL_VALUES.filter((ch) => (weights?.[ch] ?? 0) > 0);
  const channelOrder =
    positive.length > 0
      ? [
          ...positive.sort(
            (a, b) => (weights?.[b] ?? 0) - (weights?.[a] ?? 0) || a.localeCompare(b),
          ),
          ...CHANNEL_VALUES.filter((ch) => !positive.includes(ch)),
        ]
      : [...CHANNEL_VALUES];

  const totalWeight = positive.reduce((sum, ch) => sum + (weights?.[ch] ?? 0), 0);
  let assigned = 0;
  for (const ch of positive) {
    const w = weights?.[ch] ?? 0;
    const slots = Math.floor((capacity * w) / totalWeight);
    slotsByChannel[ch] = slots;
    assigned += slots;
  }
  let rem = capacity - assigned;
  let i = 0;
  while (rem > 0 && positive.length > 0) {
    const ch = positive[i % positive.length];
    slotsByChannel[ch] = (slotsByChannel[ch] ?? 0) + 1;
    rem -= 1;
    i += 1;
  }

  return { channelOrder, slotsByChannel };
}
