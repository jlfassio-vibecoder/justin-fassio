import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSupabase } from '@/lib/agentAuth';
import type { AccountResearchSnapshot } from '@/lib/accountResearch/snapshot';

const matchProspectToYelpMock = vi.fn();
const loadSnapshotMock = vi.fn();
const hasYelpFusionApiKeyMock = vi.fn(() => true);

vi.mock('@/lib/yelp/businessMatch', () => ({
  matchProspectToYelp: (...args: unknown[]) => matchProspectToYelpMock(...args),
  yelpBizSearchUrl: (business: { alias?: string | null; url: string }) =>
    business.alias ? `https://www.yelp.com/biz/${business.alias}` : business.url,
}));

vi.mock('@/lib/accountResearch/snapshot', () => ({
  loadAccountResearchSnapshot: (...args: unknown[]) => loadSnapshotMock(...args),
}));

vi.mock('@/lib/yelp/yelpFusionEnv', () => ({
  hasYelpFusionApiKey: () => hasYelpFusionApiKeyMock(),
  LOCAL_YELP_FUSION_KEY_HELP: 'missing key',
}));

import {
  buildYelpDirectoryCitationMetadata,
  findDirectoryCitationForRun,
  verifyYelpDirectoryMatchOnRun,
  yelpMatchFromDirectoryCitation,
} from '@/lib/accountResearch/verifyYelpDirectoryMatch';

const SASSY_BUSINESS = {
  id: 'yelp-sassy',
  name: 'The Sassy Seagull',
  alias: 'the-sassy-seagull-bandon',
  url: 'https://www.yelp.com/biz/the-sassy-seagull-bandon',
  phone: '541-777-7147',
  address1: '198 2nd St SE',
  city: 'Bandon',
  state: 'OR',
  postalCode: '97411',
  businessUrl: null,
  categories: ['Gift Shop'],
  isClaimed: true,
  reviewCount: 42,
  rating: 4.5,
};

const HIGH_MATCH = {
  business: SASSY_BUSINESS,
  confidence: 'high' as const,
  matchMethod: 'business_match' as const,
  score: 100,
  reasons: ['exact name'],
  candidateCount: 1,
  viableCandidateCount: 1,
};

function baseSnapshot(): AccountResearchSnapshot {
  return {
    run: {
      id: 'run-1',
      retailer_id: 674,
      identity_confidence: 'unresolved',
    } as AccountResearchSnapshot['run'],
    sources: [
      {
        id: 'source-web',
        source_type: 'website',
        research_run_id: 'run-1',
      } as AccountResearchSnapshot['sources'][number],
    ],
    citationsBySourceId: { 'source-web': [] },
    sourceFreshness: {},
    locksBySourceType: {},
  };
}

function mockSupabase(handlers: {
  prospect?: Record<string, unknown>;
  deleteError?: string | null;
  insert?: { id: string } | null;
  insertError?: string | null;
}) {
  const from = vi.fn((table: string) => {
    if (table === 'prospects') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: handlers.prospect ?? {
                id: 674,
                name: 'Sassy Seagull (Bandon Store)',
                city: 'Bandon',
                region: 'OR',
                phone: '',
                address: '',
                postal_code: '97411',
                website: null,
              },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'account_research_citations') {
      return {
        delete: () => ({
          eq: () => ({
            eq: async () => ({
              error: handlers.deleteError ? { message: handlers.deleteError } : null,
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: handlers.insert ?? { id: 'cite-1' },
              error: handlers.insertError ? { message: handlers.insertError } : null,
            }),
          }),
        }),
      };
    }
    return {};
  });

  return { from } as unknown as AgentSupabase;
}

describe('verifyYelpDirectoryMatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasYelpFusionApiKeyMock.mockReturnValue(true);
  });

  it('builds provider metadata with business snapshot', () => {
    const meta = buildYelpDirectoryCitationMetadata(HIGH_MATCH);
    expect(meta.yelp_id).toBe('yelp-sassy');
    expect(meta.business.name).toBe('The Sassy Seagull');
    expect(meta.match_confidence).toBe('high');
  });

  it('finds directory citation on snapshot', () => {
    const snapshot = baseSnapshot();
    snapshot.citationsBySourceId['source-web'] = [
      {
        id: 'cite-dir',
        platform: 'directory',
        acceptance_status: 'accepted',
        observed_at: '2026-08-26T12:00:00.000Z',
        provider_metadata: buildYelpDirectoryCitationMetadata(HIGH_MATCH),
        confidence: 'high',
      } as unknown as AccountResearchSnapshot['citationsBySourceId'][string][number],
    ];
    const citation = findDirectoryCitationForRun(snapshot);
    expect(citation?.id).toBe('cite-dir');
    expect(yelpMatchFromDirectoryCitation(citation!)?.business.name).toBe('The Sassy Seagull');
  });

  it('persists directory citation for high-confidence match', async () => {
    loadSnapshotMock.mockResolvedValueOnce(baseSnapshot()).mockResolvedValueOnce({
      ...baseSnapshot(),
      citationsBySourceId: {
        'source-web': [{ id: 'cite-1', platform: 'directory', acceptance_status: 'accepted' }],
      },
    });
    matchProspectToYelpMock.mockResolvedValue(HIGH_MATCH);

    const supabase = mockSupabase({});
    const result = await verifyYelpDirectoryMatchOnRun(supabase, 'run-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.citationIds).toEqual(['cite-1']);
      expect(result.match.confidence).toBe('high');
    }
  });

  it('returns low_confidence without persisting', async () => {
    loadSnapshotMock.mockResolvedValue(baseSnapshot());
    matchProspectToYelpMock.mockResolvedValue({ ...HIGH_MATCH, confidence: 'low', score: 30 });

    const supabase = mockSupabase({});
    const result = await verifyYelpDirectoryMatchOnRun(supabase, 'run-1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('low_confidence');
  });

  it('returns no_key when Fusion key missing', async () => {
    hasYelpFusionApiKeyMock.mockReturnValue(false);
    loadSnapshotMock.mockResolvedValue(baseSnapshot());

    const supabase = mockSupabase({});
    const result = await verifyYelpDirectoryMatchOnRun(supabase, 'run-1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('no_key');
  });
});
