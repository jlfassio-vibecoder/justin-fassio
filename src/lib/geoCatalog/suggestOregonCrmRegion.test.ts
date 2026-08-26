import { describe, expect, it } from 'vitest';
import { oregonImportOverlayFromMaps } from '@/lib/geoCatalog/oregonImportRegionOverlay';
import {
  normalizeOregonPrimaryDistrict,
  OR_COUNTY_FIPS_TO_CRM_REGION,
  suggestOregonCrmRegion,
} from '@/lib/geoCatalog/suggestOregonCrmRegion';

describe('OR_COUNTY_FIPS_TO_CRM_REGION', () => {
  it('maps all 36 Oregon counties exactly once', () => {
    const fips = Object.keys(OR_COUNTY_FIPS_TO_CRM_REGION);
    expect(fips).toHaveLength(36);
    expect(new Set(fips).size).toBe(36);
    for (const fipsCode of fips) {
      expect(fipsCode).toMatch(/^41\d{3}$/);
    }
  });
});

describe('normalizeOregonPrimaryDistrict', () => {
  it('normalizes import labels to catalog values', () => {
    expect(normalizeOregonPrimaryDistrict('Portland Metro')).toBe('Portland Metro & Gorge');
    expect(normalizeOregonPrimaryDistrict('Oregon Coast')).toBe('Oregon Coast');
    expect(normalizeOregonPrimaryDistrict('Willamette Valley')).toBe('Willamette Valley');
  });

  it('returns null for unknown districts', () => {
    expect(normalizeOregonPrimaryDistrict('Pacific NW')).toBeNull();
  });
});

describe('suggestOregonCrmRegion', () => {
  it('prefers primary_district over ZIP', () => {
    const result = suggestOregonCrmRegion({
      primaryDistrict: 'Portland Metro',
      postalCode: '97365',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.region).toBe('Portland Metro & Gorge');
      expect(result.matchedBy).toBe('primary_district');
      expect(result.confidence).toBe('high');
    }
  });

  it('resolves sample ZIPs from Oregon import CSVs', () => {
    expect(suggestOregonCrmRegion({ postalCode: '97365' })).toMatchObject({
      ok: true,
      region: 'Oregon Coast',
    });
    expect(suggestOregonCrmRegion({ postalCode: '97701' })).toMatchObject({
      ok: true,
      region: 'Central Oregon',
    });
    expect(suggestOregonCrmRegion({ postalCode: '97086' })).toMatchObject({
      ok: true,
      region: 'Portland Metro & Gorge',
    });
    expect(suggestOregonCrmRegion({ postalCode: '97477' })).toMatchObject({
      ok: true,
      region: 'Willamette Valley',
    });
  });

  it('uses import overlay by prospect id', () => {
    const overlay = oregonImportOverlayFromMaps({ 680: 'Southern Oregon' });
    const result = suggestOregonCrmRegion({
      prospectId: 680,
      importOverlay: overlay,
    });
    expect(result).toMatchObject({
      ok: true,
      region: 'Southern Oregon',
      matchedBy: 'import_csv',
    });
  });

  it('uses import overlay by normalized name', () => {
    const overlay = oregonImportOverlayFromMaps(
      {},
      {},
      { 'newport ace hardware & outdoor': 'Oregon Coast' },
    );
    const result = suggestOregonCrmRegion({
      name: 'Newport Ace Hardware & Outdoor',
      importOverlay: overlay,
    });
    expect(result).toMatchObject({
      ok: true,
      region: 'Oregon Coast',
      matchedBy: 'import_csv',
    });
  });

  it('matches import overlay names with en dashes', () => {
    const overlay = oregonImportOverlayFromMaps(
      {},
      {},
      { 'salty raven - cannon beach': 'Oregon Coast' },
    );
    const result = suggestOregonCrmRegion({
      name: 'Salty Raven \u2013 Cannon Beach',
      importOverlay: overlay,
    });
    expect(result).toMatchObject({
      ok: true,
      region: 'Oregon Coast',
      matchedBy: 'import_csv',
    });
  });

  it('falls back to city alias when ZIP missing', () => {
    const result = suggestOregonCrmRegion({ city: 'Government Camp' });
    expect(result).toMatchObject({
      ok: true,
      region: 'Portland Metro & Gorge',
      matchedBy: 'city_alias',
      confidence: 'low',
    });
  });

  it('uses city alias when ZIP spans multiple regions', () => {
    const result = suggestOregonCrmRegion({
      postalCode: '97424',
      city: 'Cottage Grove',
    });
    expect(result).toMatchObject({
      ok: true,
      region: 'Willamette Valley',
      matchedBy: 'city_alias',
      confidence: 'low',
    });
  });
});
