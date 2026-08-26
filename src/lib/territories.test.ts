import { describe, expect, it } from 'vitest';
import {
  BC_TERRITORY_CODE,
  isStoreTerritoryCode,
  suggestTerritoryCodeFromRegion,
  territoryCodeFromProvince,
} from '@/lib/territories';

describe('territoryCodeFromProvince', () => {
  it('maps known provinces and states', () => {
    expect(territoryCodeFromProvince('BC')).toBe('bc');
    expect(territoryCodeFromProvince('British Columbia')).toBe('bc');
    expect(territoryCodeFromProvince('AB')).toBe('ab');
    expect(territoryCodeFromProvince('Alberta')).toBe('ab');
    expect(territoryCodeFromProvince('CA')).toBe('ca');
    expect(territoryCodeFromProvince('OR')).toBe('or');
    expect(territoryCodeFromProvince('WA')).toBe('wa');
  });

  it('defaults unknown / empty to BC', () => {
    expect(territoryCodeFromProvince('')).toBe(BC_TERRITORY_CODE);
    expect(territoryCodeFromProvince(null)).toBe(BC_TERRITORY_CODE);
    expect(territoryCodeFromProvince('Unknown')).toBe(BC_TERRITORY_CODE);
  });
});

describe('suggestTerritoryCodeFromRegion', () => {
  it('returns codes for known region/state labels', () => {
    expect(suggestTerritoryCodeFromRegion('Oregon')).toBe('or');
    expect(suggestTerritoryCodeFromRegion('Washington')).toBe('wa');
    expect(suggestTerritoryCodeFromRegion('Alberta')).toBe('ab');
    expect(suggestTerritoryCodeFromRegion('British Columbia')).toBe('bc');
  });

  it('maps driveable CRM regions to store territories', () => {
    expect(suggestTerritoryCodeFromRegion('Portland Metro & Gorge')).toBe('or');
    expect(suggestTerritoryCodeFromRegion('Puget Sound')).toBe('wa');
    expect(suggestTerritoryCodeFromRegion('NorCal Coastal')).toBe('ca');
  });

  it('returns null for empty and garbage (never BC-default)', () => {
    expect(suggestTerritoryCodeFromRegion('')).toBeNull();
    expect(suggestTerritoryCodeFromRegion(null)).toBeNull();
    expect(suggestTerritoryCodeFromRegion('not-a-real-region')).toBeNull();
    expect(territoryCodeFromProvince('Unknown')).toBe(BC_TERRITORY_CODE);
    expect(suggestTerritoryCodeFromRegion('Unknown')).toBeNull();
  });

  it('maps BC CRM subregions to store territory BC', () => {
    expect(suggestTerritoryCodeFromRegion('Okanagan')).toBe('bc');
    expect(suggestTerritoryCodeFromRegion('Shuswap')).toBe('bc');
    expect(suggestTerritoryCodeFromRegion('Vancouver Island')).toBe('bc');
    expect(suggestTerritoryCodeFromRegion('Sea-to-Sky')).toBe('bc');
    expect(suggestTerritoryCodeFromRegion('Central Okanagan')).toBe('bc');
  });
});

describe('isStoreTerritoryCode', () => {
  it('accepts province/state store geos and rejects Northern California', () => {
    expect(isStoreTerritoryCode('bc')).toBe(true);
    expect(isStoreTerritoryCode('or')).toBe(true);
    expect(isStoreTerritoryCode('ca')).toBe(true);
    expect(isStoreTerritoryCode('norcal')).toBe(false);
    expect(isStoreTerritoryCode('Northern California')).toBe(false);
  });
});

describe('resolveStoreTerritoryCodeFromEnrichment', () => {
  it('maps known province/state and region labels', async () => {
    const { resolveStoreTerritoryCodeFromEnrichment } = await import('@/lib/territories');
    expect(
      resolveStoreTerritoryCodeFromEnrichment({ provinceOrState: 'Oregon', region: 'Okanagan' }),
    ).toBe('or');
    expect(
      resolveStoreTerritoryCodeFromEnrichment({
        provinceOrState: null,
        region: 'Washington',
      }),
    ).toBe('wa');
    expect(
      resolveStoreTerritoryCodeFromEnrichment({
        provinceOrState: 'California',
        region: null,
      }),
    ).toBe('ca');
    expect(
      resolveStoreTerritoryCodeFromEnrichment({
        provinceOrState: 'Alberta',
        region: null,
      }),
    ).toBe('ab');
    expect(
      resolveStoreTerritoryCodeFromEnrichment({
        provinceOrState: 'British Columbia',
        region: 'Okanagan',
      }),
    ).toBe('bc');
  });

  it('maps BC CRM subregions to store territory BC', async () => {
    const { resolveStoreTerritoryCodeFromEnrichment } = await import('@/lib/territories');
    expect(
      resolveStoreTerritoryCodeFromEnrichment({
        provinceOrState: null,
        region: 'Okanagan',
      }),
    ).toBe('bc');
    expect(
      resolveStoreTerritoryCodeFromEnrichment({
        provinceOrState: null,
        region: 'Central Okanagan',
      }),
    ).toBe('bc');
  });

  it('returns null for unknown regions and never BC-defaults garbage', async () => {
    const { resolveStoreTerritoryCodeFromEnrichment } = await import('@/lib/territories');
    expect(
      resolveStoreTerritoryCodeFromEnrichment({
        provinceOrState: null,
        region: 'not-a-place',
        seedTerritoryCode: null,
      }),
    ).toBeNull();
  });

  it('uses valid inbound seed only when research is unresolved', async () => {
    const { resolveStoreTerritoryCodeFromEnrichment } = await import('@/lib/territories');
    expect(
      resolveStoreTerritoryCodeFromEnrichment({
        provinceOrState: null,
        region: 'not-a-place',
        seedTerritoryCode: 'bc',
      }),
    ).toBe('bc');
    expect(
      resolveStoreTerritoryCodeFromEnrichment({
        provinceOrState: null,
        region: 'not-a-place',
        seedTerritoryCode: 'norcal',
      }),
    ).toBeNull();
  });
});
