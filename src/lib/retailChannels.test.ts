import { describe, expect, it } from 'vitest';
import {
  BEST_SELLER_BADGE_MAX_RANK,
  effectiveLifestyleThemes,
  inferLifestyleThemesFromCopy,
  isLifestyleTheme,
  normalizeLifestyleThemes,
  lifestyleThemeLabel,
  coercePrimaryRetailChannel,
  primaryFromRetailCategory,
} from '@/lib/crmRetailTaxonomy';

describe('crmRetailTaxonomy lifestyle themes', () => {
  it('normalizes and labels merchandise themes', () => {
    expect(isLifestyleTheme('golf')).toBe(true);
    expect(isLifestyleTheme('Golf')).toBe(false);
    expect(normalizeLifestyleThemes(['golf', 'beer', 'golf', 'nope'])).toEqual(['golf', 'beer']);
    expect(lifestyleThemeLabel('surf_beach')).toBe('Surf and Beach');
    expect(BEST_SELLER_BADGE_MAX_RANK).toBe(32);
  });

  it('infers themes from garment copy', () => {
    expect(
      inferLifestyleThemesFromCopy({ name: 'RUSTY TRUCK', tagline: 'Respect The Rust' }),
    ).toContain('trucks_garage');
    expect(
      inferLifestyleThemesFromCopy({ name: "STILL GRILLIN'", tagline: "Still Chillin' Grillin'" }),
    ).toContain('bbq');
    expect(
      inferLifestyleThemesFromCopy({ name: 'HAMMOCK VACATION', tagline: 'On Permanent Vacation' }),
    ).toContain('surf_beach');
    expect(
      inferLifestyleThemesFromCopy({ name: 'STILL SWINGING', tagline: 'Still Swinging' }),
    ).toContain('golf');
  });

  it('maps legacy CRM categories to primary channels', () => {
    expect(coercePrimaryRetailChannel('Golf')).toBe('golf_retail');
    expect(coercePrimaryRetailChannel('hardware_farm_rural')).toBe('hardware_farm_rural');
    expect(primaryFromRetailCategory('Golf pro shop', 'Resort Gift')).toBe('golf_retail');
    expect(primaryFromRetailCategory('Fishing / outdoor retailer', null)).toBe(
      'fishing_fly_tackle',
    );
  });

  it('prefers stored themes over inference', () => {
    expect(
      effectiveLifestyleThemes({
        lifestyleThemes: ['golf'],
        name: 'RUSTY TRUCK',
        tagline: 'Respect The Rust',
      }),
    ).toEqual(['golf']);
  });
});
