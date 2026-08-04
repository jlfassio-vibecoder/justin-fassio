import { describe, expect, it } from 'vitest';
import {
  mapBcTerritory,
  isRemoteSubterritory,
  isDenseSubterritory,
} from '@/lib/prospectEnrichment/bcTerritory';
import {
  RETAIL_CATEGORIES,
  RETAIL_CATEGORY_BASELINES,
} from '@/lib/prospectEnrichment/retailCategoryConfig';
import {
  calculateSeedFitScore,
  idealOpeningUnitsForCategory,
} from '@/lib/prospectEnrichment/seedFitScore';
import {
  assignProspectPriority,
  assignProvisionalGrade,
} from '@/lib/prospectEnrichment/priorityGrade';
import { crmChannelFromRetailCategory } from '@/lib/prospectEnrichment/crmChannelFromRetailCategory';

describe('retailCategoryConfig', () => {
  it('has baselines for every canonical category', () => {
    for (const cat of RETAIL_CATEGORIES) {
      expect(RETAIL_CATEGORY_BASELINES[cat].baseFit).toBeGreaterThanOrEqual(4);
      expect(RETAIL_CATEGORY_BASELINES[cat].idealOpeningUnits).toBeGreaterThanOrEqual(24);
    }
  });
});

describe('mapBcTerritory', () => {
  it('maps known cities without guessing', () => {
    expect(mapBcTerritory({ city: 'Kelowna' })).toEqual({
      primaryDistrict: 'Okanagan',
      subterritory: 'Central Okanagan',
    });
    expect(mapBcTerritory({ city: 'Whistler' }).subterritory).toBe('Sea-to-Sky');
    expect(mapBcTerritory({ city: 'Nanaimo' }).subterritory).toBe('Vancouver Island Central');
    expect(mapBcTerritory({ city: 'Fort St. John' }).subterritory).toBe('Peace Region');
  });

  it('returns Needs mapping for unknown cities', () => {
    expect(mapBcTerritory({ city: 'Atlantis BC' })).toEqual({
      primaryDistrict: 'Needs mapping',
      subterritory: 'Needs mapping',
    });
  });
});

describe('calculateSeedFitScore', () => {
  it('uses category baseline and dense-market +1', () => {
    const r = calculateSeedFitScore({
      retailCategory: 'Golf pro shop',
      subterritory: 'Central Okanagan',
    });
    expect(r.categoryBaseFit).toBe(9);
    expect(r.geographicAdjustment).toBe(1);
    expect(r.seedFitScore).toBe(10);
  });

  it('applies remote -1 and clamps to min 4', () => {
    const r = calculateSeedFitScore({
      retailCategory: 'Other / needs review',
      subterritory: 'Peace Region',
    });
    expect(r.geographicAdjustment).toBe(-1);
    expect(r.seedFitScore).toBe(4);
  });

  it('adds strategic reference up to max 10', () => {
    const r = calculateSeedFitScore({
      retailCategory: 'Golf pro shop',
      subterritory: 'Central Okanagan',
      strategicReference: true,
    });
    expect(r.strategicReferenceAdjustment).toBe(1);
    expect(r.seedFitScore).toBe(10);
  });

  it('returns ideal opening units from category', () => {
    expect(idealOpeningUnitsForCategory('Golf pro shop')).toBe(60);
    expect(idealOpeningUnitsForCategory('Motorcycle dealer')).toBe(48);
  });
});

describe('assignProspectPriority', () => {
  it('prevents remote Tier 1 from score alone', () => {
    expect(
      assignProspectPriority({
        fitScore: 10,
        subterritory: 'Peace Region',
        inOkanagan: false,
      }),
    ).toBe('Tier 2');
  });

  it('assigns Tier 1 for high score in Okanagan', () => {
    expect(
      assignProspectPriority({
        fitScore: 9,
        subterritory: 'Central Okanagan',
        inOkanagan: true,
      }),
    ).toBe('Tier 1');
    expect(assignProvisionalGrade('Tier 1')).toBe('A (provisional)');
  });

  it('maps dense and remote helpers', () => {
    expect(isDenseSubterritory('Fraser Valley')).toBe(true);
    expect(isRemoteSubterritory('Cariboo')).toBe(true);
  });
});

describe('crmChannelFromRetailCategory', () => {
  it('maps to CRM channels', () => {
    expect(crmChannelFromRetailCategory('Golf pro shop')).toBe('Golf');
    expect(crmChannelFromRetailCategory('Marine dealer / supply')).toBe('Marina');
    expect(crmChannelFromRetailCategory('Hardware / farm store with apparel')).toBe('Hardware');
    expect(crmChannelFromRetailCategory('Independent gift / tourist store')).toBe('Resort Gift');
  });
});
