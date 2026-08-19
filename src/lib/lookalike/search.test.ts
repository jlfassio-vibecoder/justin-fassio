import { describe, expect, it } from 'vitest';
import { filterLookalikeSearchHits } from '@/lib/lookalike/search';
import { buildLookalikeTraitBrief } from '@/lib/lookalike/traits';

describe('lookalike search filters', () => {
  it('keeps OR/WA hits, drops seed names and non-OR/WA geography', () => {
    const hits = filterLookalikeSearchHits({
      seedNames: ['Coast Outfitters'],
      hits: [
        {
          name: 'Coast Outfitters',
          city: 'Portland',
          state: 'OR',
          website: null,
          whySimilar: 'Seed',
        },
        {
          name: 'Kelowna Marina Gift',
          city: 'Kelowna',
          state: 'BC',
          website: null,
          whySimilar: 'BC shop',
        },
        {
          name: 'Deschutes Fly Shop',
          city: 'Bend',
          state: 'Oregon',
          website: 'https://example.com',
          whySimilar: 'Independent outdoor retailer',
        },
        {
          name: 'Olympia Hardware',
          city: 'Olympia',
          state: 'WA',
          website: null,
          whySimilar: 'Rural hardware',
        },
      ],
    });
    expect(hits.map((hit) => hit.name)).toEqual(['Deschutes Fly Shop', 'Olympia Hardware']);
    expect(hits[0]?.state).toBe('or');
    expect(hits[1]?.state).toBe('wa');
  });
});

describe('lookalike trait brief', () => {
  it('summarizes store type and location without copying purchase history', () => {
    const brief = buildLookalikeTraitBrief([
      {
        name: 'Coast Outfitters',
        city: 'Portland',
        territoryCode: 'or',
        category: 'outdoor_camping_hunting',
        retailCategory: 'outdoor',
      },
    ]);
    expect(brief).toMatch(/Coast Outfitters/);
    expect(brief).toMatch(/Do not treat past OGR purchase/);
    expect(brief).not.toMatch(/bought OGR/);
  });
});
