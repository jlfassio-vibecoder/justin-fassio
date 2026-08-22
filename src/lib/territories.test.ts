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

  it('returns null for empty, CRM regions, and garbage (never BC-default)', () => {
    expect(suggestTerritoryCodeFromRegion('')).toBeNull();
    expect(suggestTerritoryCodeFromRegion(null)).toBeNull();
    expect(suggestTerritoryCodeFromRegion('Okanagan')).toBeNull();
    expect(suggestTerritoryCodeFromRegion('Shuswap')).toBeNull();
    expect(suggestTerritoryCodeFromRegion('not-a-real-region')).toBeNull();
    expect(territoryCodeFromProvince('Okanagan')).toBe(BC_TERRITORY_CODE);
    expect(suggestTerritoryCodeFromRegion('Okanagan')).not.toBe(BC_TERRITORY_CODE);
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

  it('returns null for Okanagan alone and never BC-defaults unknowns', async () => {
    const { resolveStoreTerritoryCodeFromEnrichment } = await import('@/lib/territories');
    expect(
      resolveStoreTerritoryCodeFromEnrichment({
        provinceOrState: null,
        region: 'Okanagan',
      }),
    ).toBeNull();
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
        region: 'Okanagan',
        seedTerritoryCode: 'bc',
      }),
    ).toBe('bc');
    expect(
      resolveStoreTerritoryCodeFromEnrichment({
        provinceOrState: null,
        region: 'Okanagan',
        seedTerritoryCode: 'norcal',
      }),
    ).toBeNull();
  });
});
