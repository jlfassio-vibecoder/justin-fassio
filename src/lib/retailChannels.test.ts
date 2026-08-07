import { describe, expect, it } from 'vitest';
import {
  BEST_SELLER_BADGE_MAX_RANK,
  inferRetailChannelsFromCopy,
  isRetailChannel,
  normalizeRetailChannels,
  retailChannelLabel,
} from '@/lib/retailChannels';

describe('retailChannels', () => {
  it('normalizes and labels CRM channels', () => {
    expect(isRetailChannel('Golf')).toBe(true);
    expect(isRetailChannel('fishing')).toBe(false);
    expect(normalizeRetailChannels(['Resort Gift', 'Golf', 'Golf', 'nope'])).toEqual([
      'Golf',
      'Resort Gift',
    ]);
    expect(retailChannelLabel('Marina')).toBe('Marinas & Boat Stores');
    expect(BEST_SELLER_BADGE_MAX_RANK).toBe(32);
  });

  it('infers obvious channels from garment copy', () => {
    expect(
      inferRetailChannelsFromCopy({ name: 'RUSTY TRUCK', tagline: 'Respect The Rust' }),
    ).toEqual(['Hardware']);
    expect(
      inferRetailChannelsFromCopy({ name: "STILL GRILLIN'", tagline: 'Chillin Grillin' }),
    ).toEqual(['Hardware']);
    expect(
      inferRetailChannelsFromCopy({ name: 'HAMMOCK VACATION', tagline: 'On Permanent Vacation' }),
    ).toContain('Resort Gift');
    expect(
      inferRetailChannelsFromCopy({ name: 'STILL SWINGING', tagline: 'Keep swinging' }),
    ).toContain('Golf');
  });
});
