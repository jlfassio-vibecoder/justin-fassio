import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildContactResearchBrief,
  composeContactResearchBrief,
} from '@/lib/contactResearch/buildContactResearchBrief';
import {
  BC_PROSPECT_TERRITORY,
  EMPTY_PROSPECT_PLANNING,
  EMPTY_PROSPECT_TAXONOMY,
  type Prospect,
} from '@/lib/prospects';
import type { YelpMatchResult } from '@/lib/yelp/types';

const matchProspectToYelpMock = vi.fn();
const hasYelpFusionApiKeyMock = vi.fn(() => true);

vi.mock('@/lib/yelp/businessMatch', () => ({
  matchProspectToYelp: (...args: unknown[]) => matchProspectToYelpMock(...args),
  yelpBizSearchUrl: (business: { alias?: string | null; url: string }) => {
    if (business.alias?.trim()) return `https://www.yelp.com/biz/${business.alias.trim()}`;
    return business.url;
  },
}));

vi.mock('@/lib/yelp/yelpFusionEnv', () => ({
  hasYelpFusionApiKey: () => hasYelpFusionApiKeyMock(),
  LOCAL_YELP_FUSION_KEY_HELP: 'YELP_FUSION_API_KEY not configured',
}));

const ORIGINAL_YELP_KEY = process.env.YELP_FUSION_API_KEY;

afterEach(() => {
  if (ORIGINAL_YELP_KEY === undefined) delete process.env.YELP_FUSION_API_KEY;
  else process.env.YELP_FUSION_API_KEY = ORIGINAL_YELP_KEY;
  hasYelpFusionApiKeyMock.mockReturnValue(true);
});

const BASE_PROSPECT: Prospect = {
  id: 674,
  name: 'Sassy Seagull (Bandon Store)',
  category: 'golf_retail',
  region: 'Oregon Coast',
  city: 'Bandon',
  address: '198 2nd St SE',
  phone: '541-777-7147',
  fit: '',
  accountStatus: 'prospect',
  convertedAt: null,
  initialOrderDate: null,
  notes: null,
  ...EMPTY_PROSPECT_PLANNING,
  ...EMPTY_PROSPECT_TAXONOMY,
  ...BC_PROSPECT_TERRITORY,
  website: 'https://www.yelp.com/biz/the-sassy-seagull-bandon',
};

const SASSY_YELP_BUSINESS = {
  id: 'sassy',
  alias: 'the-sassy-seagull-bandon',
  name: 'The Sassy Seagull',
  url: 'https://www.yelp.com/biz/the-sassy-seagull-bandon',
  phone: '541-777-7147',
  address1: '198 2nd St SE',
  city: 'Bandon',
  state: 'OR',
  postalCode: '97411',
  businessUrl: null,
  categories: ['Gift Shop', 'Souvenir Shop'],
  isClaimed: true,
  reviewCount: 42,
  rating: 4.5,
};

describe('composeContactResearchBrief', () => {
  it('joins seed and perplexity brief', () => {
    const combined = composeContactResearchBrief('seed', 'perplexity');
    expect(combined).toContain('seed');
    expect(combined).toContain('perplexity');
  });
});

describe('buildContactResearchBrief', () => {
  it('rejects directory website and prefers resolved official site', async () => {
    process.env.YELP_FUSION_API_KEY = 'test-key';
    matchProspectToYelpMock.mockResolvedValue(null);

    const result = await buildContactResearchBrief({
      prospect: BASE_PROSPECT,
      resolvedWebsite: 'https://sassyseagull.com',
    });

    expect(result.websiteUrl).toBe('https://sassyseagull.com');
    expect(result.seedBlock).toContain('Official website hint: https://sassyseagull.com');
    expect(result.seedBlock).not.toContain('yelp.com/biz');
    expect(result.yelpMatchError).toBe('No Yelp directory match found');
  });

  it('includes rich Yelp-verified facts in seed for high-confidence match', async () => {
    process.env.YELP_FUSION_API_KEY = 'test-key';
    const yelpMatch: YelpMatchResult = {
      business: SASSY_YELP_BUSINESS,
      confidence: 'high',
      matchMethod: 'business_match',
      score: 100,
      reasons: ['exact_name'],
      candidateCount: 1,
      viableCandidateCount: 1,
    };
    matchProspectToYelpMock.mockResolvedValue(yelpMatch);

    const result = await buildContactResearchBrief({
      prospect: BASE_PROSPECT,
      resolvedWebsite: 'https://sassyseagull.com',
    });

    expect(result.yelpMatch?.business.id).toBe('sassy');
    expect(result.yelpMatchError).toBeNull();
    expect(result.seedBlock).toContain('Yelp-verified business');
    expect(result.seedBlock).toContain('Yelp name: The Sassy Seagull');
    expect(result.seedBlock).toContain('Categories: Gift Shop, Souvenir Shop');
    expect(result.seedBlock).toContain('Claimed: yes');
    expect(result.seedBlock).toContain('yelp.com/biz/the-sassy-seagull-bandon');
  });

  it('omits low-confidence Yelp match from seed and surfaces error', async () => {
    process.env.YELP_FUSION_API_KEY = 'test-key';
    matchProspectToYelpMock.mockResolvedValue({
      business: {
        id: 'wrong',
        alias: null,
        name: 'Black Bird',
        url: 'https://www.yelp.com/biz/black-bird',
        phone: null,
        address1: null,
        city: 'Medford',
        state: 'OR',
        postalCode: null,
        businessUrl: null,
        categories: [],
        isClaimed: null,
        reviewCount: null,
        rating: null,
      },
      confidence: 'low',
      matchMethod: 'business_search',
      score: 0,
      reasons: ['name_mismatch'],
      candidateCount: 1,
      viableCandidateCount: 1,
    });

    const result = await buildContactResearchBrief({ prospect: BASE_PROSPECT });
    expect(result.yelpMatch).toBeNull();
    expect(result.yelpMatchError).toContain('confidence too low');
    expect(result.seedBlock).not.toContain('Black Bird');
  });

  it('surfaces missing API key error', async () => {
    hasYelpFusionApiKeyMock.mockReturnValue(false);

    const result = await buildContactResearchBrief({ prospect: BASE_PROSPECT });
    expect(result.yelpMatch).toBeNull();
    expect(result.yelpMatchError).toContain('YELP_FUSION_API_KEY');
  });
});
