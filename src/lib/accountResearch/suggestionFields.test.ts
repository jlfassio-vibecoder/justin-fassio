import { describe, expect, it } from 'vitest';
import type { Prospect } from '@/lib/prospects';
import {
  canSuggestField,
  citationMatchesFieldPlatforms,
  isSuggestionFieldPath,
  mergeJsonArraySuggestion,
  normalizeScalarSuggestion,
  prospectBaselineValue,
  valuesEqualForSuggestion,
} from '@/lib/accountResearch/suggestionFields';

function baseProspect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    id: 1,
    name: 'Trail Outfitters',
    category: 'outdoor_camping_hunting',
    region: 'British Columbia',
    city: 'Bend',
    address: '',
    phone: '',
    fit: '',
    accountStatus: 'prospect',
    convertedAt: null,
    initialOrderDate: null,
    notes: null,
    territoryId: '00000000-0000-4000-8000-000000000001',
    territoryCode: 'or',
    territoryName: 'Oregon',
    operationalTerritoryId: null,
    operationalTerritoryCode: null,
    operationalTerritoryName: null,
    externalId: null,
    subterritory: null,
    primaryDistrict: null,
    retailCategory: null,
    website: null,
    fitScore: null,
    idealOpeningUnits: null,
    priority: null,
    provisionalGrade: null,
    verificationStatus: null,
    buyerVerified: false,
    importProtected: false,
    apparelCapability: null,
    existingOgr: null,
    qualificationStatus: null,
    nextAction: null,
    sourceNote: null,
    postalCode: null,
    secondaryChannels: [],
    retailSubchannels: [],
    venueContexts: [],
    lifestyleThemes: [],
    retailCapabilities: [],
    ...overrides,
  };
}

describe('suggestionFields', () => {
  it('recognizes allowlisted field paths', () => {
    expect(isSuggestionFieldPath('website')).toBe(true);
    expect(isSuggestionFieldPath('territory_id')).toBe(false);
  });

  it('matches citation platforms per field', () => {
    expect(citationMatchesFieldPlatforms('shopify', 'website')).toBe(true);
    expect(citationMatchesFieldPlatforms('instagram', 'website')).toBe(false);
    expect(citationMatchesFieldPlatforms('instagram', 'lifestyle_themes')).toBe(true);
    expect(citationMatchesFieldPlatforms('directory', 'phone')).toBe(true);
    expect(citationMatchesFieldPlatforms('directory', 'address')).toBe(true);
    expect(citationMatchesFieldPlatforms('directory', 'website')).toBe(false);
  });

  it('blocks non-blank identity fields when blank-only', () => {
    const prospect = baseProspect({ city: 'Bend' });
    expect(canSuggestField(prospect, 'city', 'Portland')).toBe(false);
  });

  it('normalizes website suggestions', () => {
    expect(normalizeScalarSuggestion('website', 'trailoutfitters.com')).toBe(
      'https://trailoutfitters.com',
    );
  });

  it('rejects array values for scalar fields', () => {
    expect(normalizeScalarSuggestion('city', ['Portland', 'OR'])).toBeNull();
  });

  it('merges lifestyle themes without duplicates', () => {
    const prospect = baseProspect({ lifestyleThemes: ['fishing'] });
    const merged = mergeJsonArraySuggestion('lifestyle_themes', prospect, ['fishing', 'camping']);
    expect(merged).toEqual(expect.arrayContaining(['fishing', 'camping']));
    expect(merged?.length).toBe(2);
  });

  it('compares baseline values for concurrency', () => {
    const prospect = baseProspect({ website: null });
    const baseline = prospectBaselineValue(prospect, 'website');
    expect(valuesEqualForSuggestion(baseline, null)).toBe(true);
    expect(valuesEqualForSuggestion(baseline, 'https://example.com')).toBe(false);
  });
});
