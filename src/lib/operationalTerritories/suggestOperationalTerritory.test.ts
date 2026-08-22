import { describe, expect, it } from 'vitest';
import { countiesForZip } from '@/lib/operationalTerritories/deriveCountyFips';
import { ZIP_MEMBERSHIP_SEEDS } from '@/lib/operationalTerritories/membershipSeedData';
import { suggestOperationalTerritoryForAccount } from '@/lib/operationalTerritories/suggestOperationalTerritory';

describe('countiesForZip', () => {
  it('returns all candidate counties for a multi-county ZIP', () => {
    const counties = countiesForZip('89019', 'CA');
    expect(counties.length).toBeGreaterThan(1);
    expect(counties).toContain('06027');
    expect(counties).toContain('06071');
  });

  it('returns empty for unknown ZIP', () => {
    expect(countiesForZip('00000', 'WA')).toEqual([]);
  });
});

describe('suggestOperationalTerritoryForAccount', () => {
  it('resolves seeded LA ZIP exactly', () => {
    const zipRow = ZIP_MEMBERSHIP_SEEDS[0];
    const result = suggestOperationalTerritoryForAccount({
      postalCode: zipRow.zip,
      storeTerritoryCode: 'ca',
    });
    expect(result).toEqual({
      ok: true,
      territoryCode: zipRow.territory_code,
      matchedBy: 'zip',
    });
  });

  it('prefers LA ZIP exact over county consensus', () => {
    const zipRow = ZIP_MEMBERSHIP_SEEDS.find((r) => r.territory_code === 'la-metro-oc');
    expect(zipRow).toBeTruthy();
    const result = suggestOperationalTerritoryForAccount({
      postalCode: zipRow!.zip,
      storeTerritoryCode: 'ca',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.matchedBy).toBe('zip');
  });

  it('suggests when multi-county ZIP maps to one ops territory', () => {
    // 89019 → Inyo (06027) + San Bernardino (06071) → both ie-san-diego
    const result = suggestOperationalTerritoryForAccount({
      postalCode: '89019',
      storeTerritoryCode: 'ca',
    });
    expect(result).toEqual({
      ok: true,
      territoryCode: 'ie-san-diego',
      matchedBy: 'county_consensus',
    });
  });

  it('returns unresolved when multi-county ZIP spans different ops territories', () => {
    // 92530 → Orange (06059 → la-metro-oc) + Riverside (06065 → ie-san-diego)
    const result = suggestOperationalTerritoryForAccount({
      postalCode: '92530',
      storeTerritoryCode: 'ca',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unresolved_geography');
      expect(result.detail).toMatch(/multi_county_span/);
    }
  });

  it('resolves single-county ZIP via county membership (Monterey)', () => {
    // 93940 is Monterey Peninsula (06053) in Census crosswalk
    const counties = countiesForZip('93940', 'CA');
    expect(counties).toContain('06053');
    const result = suggestOperationalTerritoryForAccount({
      postalCode: '93940',
      storeTerritoryCode: 'ca',
    });
    expect(result).toEqual({
      ok: true,
      territoryCode: 'norcal-coastal',
      matchedBy: counties.length === 1 ? 'county' : 'county_consensus',
    });
  });

  it('returns store_not_eligible for BC', () => {
    const result = suggestOperationalTerritoryForAccount({
      postalCode: '98101',
      storeTerritoryCode: 'bc',
    });
    expect(result).toEqual({ ok: false, reason: 'store_not_eligible' });
  });

  it('returns missing_zip_or_county when no ZIP available', () => {
    const result = suggestOperationalTerritoryForAccount({
      postalCode: '',
      address: 'No zip here',
      storeTerritoryCode: 'wa',
    });
    expect(result).toEqual({ ok: false, reason: 'missing_zip_or_county' });
  });

  it('extracts ZIP from address when postal blank', () => {
    const zipRow = ZIP_MEMBERSHIP_SEEDS[0];
    const result = suggestOperationalTerritoryForAccount({
      postalCode: '',
      address: `123 Main St, Los Angeles CA ${zipRow.zip}`,
      storeTerritoryCode: 'ca',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.territoryCode).toBe(zipRow.territory_code);
  });

  it('returns unresolved for unknown ZIP', () => {
    const result = suggestOperationalTerritoryForAccount({
      postalCode: '00000',
      storeTerritoryCode: 'wa',
    });
    expect(result.ok).toBe(false);
  });
});
