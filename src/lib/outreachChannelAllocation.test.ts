import { describe, expect, it } from 'vitest';
import { allocateChannelsForDay } from '@/lib/outreachChannelAllocation';
import { PRIMARY_RETAIL_CHANNELS } from '@/lib/crmRetailTaxonomy';

describe('allocateChannelsForDay', () => {
  it('returns zero slots when capacity is 0', () => {
    const result = allocateChannelsForDay({ preparationDate: '2026-08-12', capacity: 0 });
    expect(result.channelOrder).toHaveLength(PRIMARY_RETAIL_CHANNELS.length);
    expect(Object.values(result.slotsByChannel).every((n) => n === 0)).toBe(true);
  });

  it('round-robins capacity across primary channels without weights', () => {
    const result = allocateChannelsForDay({ preparationDate: '2026-08-12', capacity: 5 });
    const total = Object.values(result.slotsByChannel).reduce((a, b) => a + b, 0);
    expect(total).toBe(5);
    expect(result.slotsByChannel[PRIMARY_RETAIL_CHANNELS[0].value]).toBeGreaterThanOrEqual(1);
  });

  it('respects positive weights proportionally', () => {
    const result = allocateChannelsForDay({
      preparationDate: '2026-08-12',
      capacity: 10,
      weights: {
        golf_retail: 3,
        marine_retail: 1,
      },
    });
    const total = Object.values(result.slotsByChannel).reduce((a, b) => a + b, 0);
    expect(total).toBe(10);
    expect(result.slotsByChannel.golf_retail).toBeGreaterThan(result.slotsByChannel.marine_retail);
    expect(result.channelOrder[0]).toBe('golf_retail');
  });
});
