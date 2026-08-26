import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  confidenceFromScore,
  countViableYelpCandidates,
  mapRawYelpBusiness,
  matchProspectToYelp,
  normalizeYelpMatchName,
  normalizeYelpPhone,
  scoreYelpMatch,
  yelpBizSearchUrl,
  type YelpFetchFn,
} from '@/lib/yelp/businessMatch';

const ORIGINAL_YELP_KEY = process.env.YELP_FUSION_API_KEY;

afterEach(() => {
  if (ORIGINAL_YELP_KEY === undefined) delete process.env.YELP_FUSION_API_KEY;
  else process.env.YELP_FUSION_API_KEY = ORIGINAL_YELP_KEY;
});

describe('normalizeYelpPhone', () => {
  it('formats 10-digit US numbers', () => {
    expect(normalizeYelpPhone('5412651234')).toBe('541-265-1234');
    expect(normalizeYelpPhone('(541) 265-1234')).toBe('541-265-1234');
  });
});

describe('mapRawYelpBusiness', () => {
  it('maps Fusion API location fields', () => {
    const mapped = mapRawYelpBusiness({
      id: 'newport-ace-newport',
      name: 'Newport Ace Hardware',
      url: 'https://www.yelp.com/biz/newport-ace-newport',
      phone: '+15412651234',
      location: {
        address1: '123 Main St',
        city: 'Newport',
        state: 'OR',
        zip_code: '97365',
      },
      business_url: 'https://newportace.com',
    });
    expect(mapped).toMatchObject({
      id: 'newport-ace-newport',
      name: 'Newport Ace Hardware',
      phone: '541-265-1234',
      address1: '123 Main St',
      city: 'Newport',
      postalCode: '97365',
      businessUrl: 'https://newportace.com',
    });
  });

  it('maps alias, categories, claimed, review count, and rating', () => {
    const mapped = mapRawYelpBusiness({
      id: 'the-sassy-seagull-bandon',
      alias: 'the-sassy-seagull-bandon',
      name: 'The Sassy Seagull',
      url: 'https://www.yelp.com/biz/the-sassy-seagull-bandon?osq=Gift+Shop',
      categories: [{ title: 'Gift Shop' }, { title: 'Souvenir Shop' }],
      is_claimed: true,
      review_count: 42,
      rating: 4.5,
      location: { city: 'Bandon', state: 'OR' },
    });
    expect(mapped).toMatchObject({
      alias: 'the-sassy-seagull-bandon',
      categories: ['Gift Shop', 'Souvenir Shop'],
      isClaimed: true,
      reviewCount: 42,
      rating: 4.5,
    });
  });
});

describe('yelpBizSearchUrl', () => {
  it('prefers alias for clean listing URL', () => {
    const business = mapRawYelpBusiness({
      id: 'the-sassy-seagull-bandon',
      alias: 'the-sassy-seagull-bandon',
      name: 'The Sassy Seagull',
      url: 'https://www.yelp.com/biz/the-sassy-seagull-bandon?osq=Gift+Shop',
    })!;
    expect(yelpBizSearchUrl(business)).toBe('https://www.yelp.com/biz/the-sassy-seagull-bandon');
  });
});

describe('scoreYelpMatch', () => {
  const business = mapRawYelpBusiness({
    id: 'x',
    name: 'Newport Ace Hardware',
    location: { city: 'Newport', zip_code: '97365' },
    phone: '5412651234',
  })!;

  it('scores exact name and city as high', () => {
    const scored = scoreYelpMatch(
      {
        name: 'Newport Ace Hardware',
        city: 'Newport',
        postalCode: '97365',
        phone: '541-265-1234',
      },
      business,
    );
    expect(scored.score).toBeGreaterThanOrEqual(80);
    expect(confidenceFromScore(scored.score, scored.reasons, 1)).toBe('high');
  });

  it('downgrades ambiguous multi-candidate matches', () => {
    const scored = scoreYelpMatch({ name: 'Newport Ace Hardware', city: 'Newport' }, business);
    expect(confidenceFromScore(scored.score, scored.reasons, 2)).toBe('low');
  });

  it('treats clear winner as single viable when Yelp returns unrelated second match', () => {
    const input = {
      name: 'Sassy Seagull (Bandon Store)',
      city: 'Bandon',
      postalCode: '97411',
      phone: '541-777-7147',
    };
    const scored = [
      scoreYelpMatch(
        input,
        mapRawYelpBusiness({
          id: 'sassy',
          name: 'The Sassy Seagull',
          phone: '541-777-7147',
          location: { address1: '198 2nd St SE', city: 'Bandon', state: 'OR', zip_code: '97411' },
        })!,
      ),
      scoreYelpMatch(
        input,
        mapRawYelpBusiness({
          id: 'bakery',
          name: 'Bandon Baking Company',
          phone: '541-347-9440',
          location: { address1: '160 2nd St SE', city: 'Bandon', state: 'OR', zip_code: '97411' },
        })!,
      ),
    ].sort((a, b) => b.score - a.score);

    expect(scored[0]?.score).toBe(100);
    expect(countViableYelpCandidates(scored)).toBe(1);
    expect(confidenceFromScore(scored[0]!.score, scored[0]!.reasons, 1)).toBe('high');
  });

  it('matches compact names after stripping spaces (Farmhouse Funk)', () => {
    const scored = scoreYelpMatch(
      { name: 'FARM HOUSE FUNK', city: 'Astoria' },
      mapRawYelpBusiness({
        id: 'ff',
        name: 'Farmhouse Funk',
        location: { city: 'Astoria', state: 'OR' },
      })!,
    );
    expect(scored.reasons).toContain('compact_name');
    expect(confidenceFromScore(scored.score, scored.reasons, 1)).toBe('high');
  });

  it('matches after stripping parenthetical and leading The (Sassy Seagull)', () => {
    expect(normalizeYelpMatchName('Sassy Seagull (Bandon Store)')).toBe('sassy seagull');
    expect(normalizeYelpMatchName('The Sassy Seagull')).toBe('sassy seagull');
    const scored = scoreYelpMatch(
      { name: 'Sassy Seagull (Bandon Store)', city: 'Bandon' },
      mapRawYelpBusiness({
        id: 'ss',
        name: 'The Sassy Seagull',
        location: { city: 'Bandon', state: 'OR' },
      })!,
    );
    expect(scored.reasons).toContain('exact_name');
    expect(confidenceFromScore(scored.score, scored.reasons, 1)).toBe('high');
  });

  it('rejects unrelated business with name mismatch (U Save Gas & Tackle vs Black Bird)', () => {
    const scored = scoreYelpMatch(
      { name: 'U Save Gas & Tackle', city: 'Grants Pass' },
      mapRawYelpBusiness({
        id: 'bb',
        name: 'Black Bird',
        location: { city: 'Medford', state: 'OR' },
      })!,
    );
    expect(scored.reasons).toContain('name_mismatch');
    expect(confidenceFromScore(scored.score, scored.reasons, 1)).toBe('low');
  });
});

describe('matchProspectToYelp', () => {
  it('uses business match then enriches via details', async () => {
    const fetchFn: YelpFetchFn = vi.fn(async (url: string) => {
      if (url.includes('/businesses/matches')) {
        return new Response(
          JSON.stringify({
            businesses: [
              {
                id: 'bandon-dunes-golf',
                name: 'Bandon Dunes Golf Resort Pro Shop',
                url: 'https://www.yelp.com/biz/bandon-dunes-golf',
                location: { city: 'Bandon', state: 'OR' },
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes('/businesses/bandon-dunes-golf')) {
        return new Response(
          JSON.stringify({
            id: 'bandon-dunes-golf',
            name: 'Bandon Dunes Golf Resort Pro Shop',
            url: 'https://www.yelp.com/biz/bandon-dunes-golf',
            phone: '+15413471234',
            location: {
              address1: '57744 Round Lake Dr',
              city: 'Bandon',
              state: 'OR',
              zip_code: '97411',
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ businesses: [] }), { status: 200 });
    });

    process.env.YELP_FUSION_API_KEY = 'test-key';
    const result = await matchProspectToYelp(
      { name: 'Bandon Dunes Golf Resort Pro Shop', city: 'Bandon' },
      { fetchFn },
    );

    expect(result?.matchMethod).toBe('business_match');
    expect(result?.business.phone).toBe('541-347-1234');
    expect(result?.confidence).toBe('high');
  });

  it('falls back to business search when match is empty', async () => {
    const fetchFn: YelpFetchFn = vi.fn(async (url: string) => {
      if (url.includes('/businesses/matches')) {
        return new Response(JSON.stringify({ businesses: [] }), { status: 200 });
      }
      if (url.includes('/businesses/search')) {
        return new Response(
          JSON.stringify({
            businesses: [
              {
                id: 'winter-river-books',
                name: 'WinterRiver Books',
                location: { city: 'Florence', state: 'OR' },
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes('/businesses/winter-river-books')) {
        return new Response(
          JSON.stringify({
            id: 'winter-river-books',
            name: 'WinterRiver Books',
            location: { city: 'Florence', state: 'OR', zip_code: '97439' },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ businesses: [] }), { status: 200 });
    });

    process.env.YELP_FUSION_API_KEY = 'test-key';
    const result = await matchProspectToYelp(
      { name: 'WinterRiver Books', city: 'Florence' },
      { fetchFn },
    );

    expect(result?.matchMethod).toBe('business_search');
    expect(result?.business.city).toBe('Florence');
  });

  it('does not upgrade ambiguous multi-candidate match to high after details enrichment', async () => {
    const fetchFn: YelpFetchFn = vi.fn(async (url: string) => {
      if (url.includes('/businesses/matches')) {
        return new Response(
          JSON.stringify({
            businesses: [
              {
                id: 'store-a',
                name: 'Coastal Outfitters',
                location: { city: 'Newport', state: 'OR' },
              },
              {
                id: 'store-b',
                name: 'Coastal Outfitters Plus',
                location: { city: 'Newport', state: 'OR' },
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes('/businesses/store-a')) {
        return new Response(
          JSON.stringify({
            id: 'store-a',
            name: 'Coastal Outfitters',
            location: { city: 'Newport', state: 'OR', zip_code: '97365' },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ businesses: [] }), { status: 200 });
    });

    process.env.YELP_FUSION_API_KEY = 'test-key';
    const result = await matchProspectToYelp(
      { name: 'Coastal Outfitters', city: 'Newport' },
      { fetchFn },
    );

    expect(result?.candidateCount).toBe(2);
    expect(result?.viableCandidateCount).toBe(2);
    expect(result?.confidence).toBe('low');
  });

  it('matches Sassy Seagull when Yelp returns an unrelated second business match', async () => {
    const fetchFn: YelpFetchFn = vi.fn(async (url: string) => {
      if (url.includes('/businesses/matches')) {
        return new Response(
          JSON.stringify({
            businesses: [
              {
                id: 'sassy-seagull-bandon',
                name: 'The Sassy Seagull',
                phone: '+15417777147',
                location: {
                  address1: '198 2nd St SE',
                  city: 'Bandon',
                  state: 'OR',
                  zip_code: '97411',
                },
              },
              {
                id: 'bandon-baking',
                name: 'Bandon Baking Company',
                phone: '+15413479440',
                location: {
                  address1: '160 2nd St SE',
                  city: 'Bandon',
                  state: 'OR',
                  zip_code: '97411',
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes('/businesses/sassy-seagull-bandon')) {
        return new Response(
          JSON.stringify({
            id: 'sassy-seagull-bandon',
            name: 'The Sassy Seagull',
            url: 'https://www.yelp.com/biz/the-sassy-seagull-bandon',
            phone: '+15417777147',
            location: {
              address1: '198 2nd St SE',
              city: 'Bandon',
              state: 'OR',
              zip_code: '97411',
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ businesses: [] }), { status: 200 });
    });

    process.env.YELP_FUSION_API_KEY = 'test-key';
    const result = await matchProspectToYelp(
      {
        name: 'Sassy Seagull (Bandon Store)',
        address: '198 2nd St SE, Bandon, OR 97411',
        city: 'Bandon',
        postalCode: '97411',
        phone: '541-777-7147',
      },
      { fetchFn },
    );

    expect(result?.business.name).toBe('The Sassy Seagull');
    expect(result?.candidateCount).toBe(2);
    expect(result?.viableCandidateCount).toBe(1);
    expect(result?.confidence).toBe('high');
  });
});
