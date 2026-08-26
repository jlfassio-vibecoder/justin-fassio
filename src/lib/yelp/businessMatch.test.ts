import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  confidenceFromScore,
  mapRawYelpBusiness,
  matchProspectToYelp,
  normalizeYelpMatchName,
  normalizeYelpPhone,
  scoreYelpMatch,
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
    expect(result?.confidence).toBe('low');
  });
});
