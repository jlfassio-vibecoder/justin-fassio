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

vi.mock('@/lib/yelp/businessMatch', () => ({
  matchProspectToYelp: (...args: unknown[]) => matchProspectToYelpMock(...args),
}));

const ORIGINAL_YELP_KEY = process.env.YELP_FUSION_API_KEY;

afterEach(() => {
  if (ORIGINAL_YELP_KEY === undefined) delete process.env.YELP_FUSION_API_KEY;
  else process.env.YELP_FUSION_API_KEY = ORIGINAL_YELP_KEY;
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
  });

  it('includes high-confidence Yelp match in seed', async () => {
    process.env.YELP_FUSION_API_KEY = 'test-key';
    const yelpMatch: YelpMatchResult = {
      business: {
        id: 'sassy',
        name: 'The Sassy Seagull',
        url: 'https://www.yelp.com/biz/the-sassy-seagull-bandon',
        phone: '541-777-7147',
        address1: '198 2nd St SE',
        city: 'Bandon',
        state: 'OR',
        postalCode: '97411',
        businessUrl: null,
      },
      confidence: 'high',
      matchMethod: 'business_match',
      score: 100,
      reasons: ['exact_name'],
      candidateCount: 1,
    };
    matchProspectToYelpMock.mockResolvedValue(yelpMatch);

    const result = await buildContactResearchBrief({
      prospect: BASE_PROSPECT,
      resolvedWebsite: 'https://sassyseagull.com',
    });

    expect(result.yelpMatch?.business.id).toBe('sassy');
    expect(result.seedBlock).toContain('Yelp directory listing');
    expect(result.seedBlock).toContain('yelp.com/biz/the-sassy-seagull-bandon');
  });

  it('omits low-confidence Yelp match from seed', async () => {
    process.env.YELP_FUSION_API_KEY = 'test-key';
    matchProspectToYelpMock.mockResolvedValue({
      business: {
        id: 'wrong',
        name: 'Black Bird',
        url: 'https://www.yelp.com/biz/black-bird',
        phone: null,
        address1: null,
        city: 'Medford',
        state: 'OR',
        postalCode: null,
        businessUrl: null,
      },
      confidence: 'low',
      matchMethod: 'business_search',
      score: 0,
      reasons: ['name_mismatch'],
      candidateCount: 1,
    });

    const result = await buildContactResearchBrief({ prospect: BASE_PROSPECT });
    expect(result.yelpMatch).toBeNull();
    expect(result.seedBlock).not.toContain('Black Bird');
  });
});
