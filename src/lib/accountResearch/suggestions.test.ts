import { describe, expect, it } from 'vitest';
import type { Prospect } from '@/lib/prospects';
import type { AccountResearchCitation } from '@/types/database';
import {
  buildGeneratedSuggestions,
  collectAcceptedCitations,
  filterNoOpSuggestions,
} from '@/lib/accountResearch/suggestions';

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

function citation(overrides: Partial<AccountResearchCitation>): AccountResearchCitation {
  return {
    id: 'citation-1',
    source_search_id: 'source-1',
    research_run_id: 'run-1',
    retailer_id: 1,
    source_url: 'https://trailoutfitters.com/about',
    source_url_normalized: 'https://trailoutfitters.com/about',
    title: 'About',
    platform: 'website',
    published_at: null,
    observed_at: '2026-08-23T12:00:00.000Z',
    excerpt: 'Outdoor retailer in Bend',
    confidence: 'high',
    identity_confidence: 'high',
    acceptance_status: 'accepted',
    acceptance_basis: 'identity_gate',
    accepted_or_rejected_by: null,
    accepted_or_rejected_at: null,
    provider_metadata: {},
    created_at: '2026-08-23T12:00:00.000Z',
    ...overrides,
  };
}

describe('accountResearch suggestions', () => {
  it('collects only accepted citations with URLs', () => {
    const rows = collectAcceptedCitations({
      s1: [
        citation({ id: 'a', acceptance_status: 'accepted' }),
        citation({ id: 'b', acceptance_status: 'pending' }),
        citation({ id: 'c', acceptance_status: 'accepted', source_url: '  ' }),
      ],
    });
    expect(rows.map((r) => r.id)).toEqual(['a']);
  });

  it('builds deterministic website suggestion without model', async () => {
    const prospect = baseProspect();
    const rows = await buildGeneratedSuggestions({
      prospect,
      citations: [citation({})],
      useModel: false,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.field_path).toBe('website');
    expect(rows[0]?.citation_ids).toEqual(['citation-1']);
    expect(rows[0]?.suggested_value).toBe('https://trailoutfitters.com/about');
  });

  it('omits no-op website suggestion when canonical already matches', async () => {
    const prospect = baseProspect({ website: 'https://trailoutfitters.com/about' });
    const rows = await buildGeneratedSuggestions({
      prospect,
      citations: [citation({})],
      useModel: false,
    });
    expect(rows).toHaveLength(0);
  });

  it('filters no-op suggestions before persist', () => {
    const prospect = baseProspect();
    const filtered = filterNoOpSuggestions(prospect, [
      {
        field_path: 'website',
        suggested_value: 'https://trailoutfitters.com',
        rationale: 'test',
        confidence: 'high',
        citation_ids: ['citation-1'],
        baseline_value: null,
      },
      {
        field_path: 'city',
        suggested_value: 'Bend',
        rationale: 'test',
        confidence: 'high',
        citation_ids: ['citation-1'],
        baseline_value: 'Bend',
      },
    ]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.field_path).toBe('website');
  });
});
