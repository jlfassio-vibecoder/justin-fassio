import { describe, expect, it } from 'vitest';
import {
  BEST_SELLER_BADGE_MAX_RANK,
  effectiveRetailChannels,
  inferRetailChannelsFromCopy,
  isRetailChannel,
  normalizeRetailChannels,
  resolveRetailChannelFilter,
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
    expect(normalizeRetailChannels(['Golf Pro Shops'])).toEqual(['Golf']);
    expect(retailChannelLabel('Marina')).toBe('Marinas & Boat Stores');
    expect(resolveRetailChannelFilter('Hardware Dealers & Co-ops')).toBe('Hardware');
    expect(BEST_SELLER_BADGE_MAX_RANK).toBe(32);
  });

  it('infers obvious channels from garment copy and defaults leftovers', () => {
    expect(
      inferRetailChannelsFromCopy({ name: 'RUSTY TRUCK', tagline: 'Respect The Rust' }),
    ).toEqual(['Hardware']);
    expect(
      inferRetailChannelsFromCopy({ name: "STILL GRILLIN'", tagline: "Still Chillin' Grillin'" }),
    ).toEqual(['Hardware']);
    expect(
      inferRetailChannelsFromCopy({ name: 'HAMMOCK VACATION', tagline: 'On Permanent Vacation' }),
    ).toContain('Resort Gift');
    expect(
      inferRetailChannelsFromCopy({ name: 'STILL SWINGING', tagline: 'Still Swinging' }),
    ).toContain('Golf');
    expect(
      inferRetailChannelsFromCopy({
        name: 'BEST ROUND',
        tagline: 'Best Round Of The Day / 19th Hole',
      }),
    ).toContain('Golf');
    expect(
      inferRetailChannelsFromCopy({ name: "HOOKIN' UP", tagline: "Still Hookin' Up" }),
    ).toContain('Marina');
    expect(
      inferRetailChannelsFromCopy({ name: 'MYSTERY TEE', tagline: 'No Keywords Here' }),
    ).toEqual(['Resort Gift']);
  });

  it('prefers stored themes over inference', () => {
    expect(
      effectiveRetailChannels({
        lifestyleThemes: ['Golf'],
        name: 'RUSTY TRUCK',
        tagline: 'Respect The Rust',
      }),
    ).toEqual(['Golf']);
    expect(
      effectiveRetailChannels({
        lifestyleThemes: [],
        name: 'RUSTY TRUCK',
        tagline: 'Respect The Rust',
      }),
    ).toEqual(['Hardware']);
  });
});
