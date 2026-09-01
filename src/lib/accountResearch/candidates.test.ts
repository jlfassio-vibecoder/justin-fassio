import { describe, expect, it } from 'vitest';
import {
  prependUniqueCandidate,
  toSearchCandidates,
  toSocialProfileCandidates,
  toWebsiteSearchCandidates,
} from '@/lib/accountResearch/candidates';
import { canonicalizeSocialProfileUrl } from '@/lib/accountResearch/socialProfile';

describe('toSearchCandidates', () => {
  it('keeps the first 5 tool URLs including directory hosts', () => {
    const candidates = toSearchCandidates([
      {
        url: 'https://www.yellowpages.ca/bus/listing',
        title: 'YP',
        snippet: 'listing',
      },
      {
        url: 'https://www.buckerfields.ca/',
        title: "Buckerfield's Kelowna",
        snippet: 'Kelowna, BC country store',
      },
      { url: 'https://www.facebook.com/buckerfields', title: 'FB', snippet: '' },
      { url: 'https://yelp.com/biz/buckerfields', title: 'Yelp', snippet: '' },
      { url: 'https://trailoutfitters.com', title: 'Other', snippet: '' },
      { url: 'https://example.net/extra', title: 'Sixth', snippet: '' },
    ]);
    expect(candidates).toHaveLength(5);
    expect(candidates[0]?.url).toContain('yellowpages.ca');
    expect(candidates.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(candidates.some((c) => c.url.includes('example.net'))).toBe(false);
  });

  it('filters to platform hosts when requested', () => {
    const candidates = toSearchCandidates(
      [
        { url: 'https://www.facebook.com/TheCountryClubID/', title: 'Idaho', snippet: '' },
        { url: 'https://spallumcheengolf.com', title: 'Website', snippet: '' },
        { url: 'https://www.facebook.com/SpallGolf', title: 'SpallGolf', snippet: '' },
      ],
      { hostFilter: ['facebook.com', 'fb.com'] },
    );
    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.url).toContain('TheCountryClubID');
    expect(candidates[1]?.url).toContain('SpallGolf');
  });

  it('prepends a unique official website link without exceeding 5', () => {
    const base = toSearchCandidates([
      { url: 'https://instagram.com/other1', title: '1', snippet: '' },
      { url: 'https://instagram.com/other2', title: '2', snippet: '' },
      { url: 'https://instagram.com/other3', title: '3', snippet: '' },
      { url: 'https://instagram.com/other4', title: '4', snippet: '' },
      { url: 'https://instagram.com/other5', title: '5', snippet: '' },
    ]);
    const withOfficial = prependUniqueCandidate(base, {
      rank: 1,
      url: 'https://www.instagram.com/spallgolf/',
      title: 'Official website link',
      snippet: 'JSON-LD sameAs',
    });
    expect(withOfficial).toHaveLength(5);
    expect(withOfficial[0]?.url).toContain('instagram.com/spallgolf');
  });
});

describe('toWebsiteSearchCandidates', () => {
  it('drops directory SERP hosts and surfaces official URL from snippet text', () => {
    const candidates = toWebsiteSearchCandidates('Kelowna Golf & Country Club', [
      {
        url: 'https://golfnb.ca/golf-facility/kelowna-golf-country-club-en',
        title: 'Kelowna Golf & Country Club - Golf New Brunswick',
        snippet:
          '- **Website** www.kelownagolfandcountryclub.com - **Location** Kelowna, BC - **Phone** (250) 762-2531',
      },
      {
        url: 'https://secure.kelownachamber.org/Golf-Courses-Services/Kelowna-Golf-Country-Club-621',
        title: 'Kelowna Golf & Country Club',
        snippet: 'Kelowna Chamber listing',
      },
      {
        url: 'https://integolf.com/course/kelowna-golf-country-club',
        title: 'Tee Times',
        snippet: '1297 Glenmore Drive',
      },
      {
        url: 'https://gga-arch.com/projects-item/kelowna-golf-country-club',
        title: 'Architecture project',
        snippet: 'member-owned club',
      },
    ]);

    expect(candidates.every((c) => !c.url.includes('golfnb.ca'))).toBe(true);
    expect(candidates.every((c) => !c.url.includes('kelownachamber'))).toBe(true);
    expect(candidates.every((c) => !c.url.includes('integolf.com'))).toBe(true);
    expect(candidates[0]?.url).toMatch(/kelownagolfandcountryclub\.com/i);
  });

  it('drops peer golf clubs that do not match Black Mountain by name', () => {
    const candidates = toWebsiteSearchCandidates('Black Mountain Golf Club', [
      {
        url: 'https://okanagangolfclub.com/',
        title: 'The Okanagan Golf Club',
        snippet: 'Kelowna BC',
      },
      {
        url: 'https://michaelbrookgolfclub.com/',
        title: 'Michaelbrook Golf Club',
        snippet: 'okanagan wine country',
      },
      {
        url: 'https://blackmountaingolfclub.com/',
        title: 'Black Mountain Golf Club',
        snippet: 'Kelowna',
      },
      {
        url: 'https://golftowerranch.com/',
        title: 'Tower Ranch Golf & Country Club',
        snippet: 'Kelowna',
      },
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.url).toMatch(/blackmountaingolfclub\.com/i);
  });

  it('rejects an unrelated business that only shares the place-name tokens', () => {
    // "Black Mountain" alone is a shared local place name — a distillery, a
    // vineyard, or a trailhead nearby can legitimately host/title-match on
    // just "black" + "mountain". Requiring "golf" + "club" too (the category
    // words from the CRM name) is what tells them apart.
    const candidates = toWebsiteSearchCandidates('Black Mountain Golf Club', [
      {
        url: 'https://blackmountaindistillery.com/',
        title: 'Black Mountain Distillery — Craft Spirits',
        snippet: 'Small-batch spirits in the Black Mountain area',
      },
      {
        url: 'https://blackmountaingolfclub.com/',
        title: 'Black Mountain Golf Club',
        snippet: 'Kelowna',
      },
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.url).toMatch(/blackmountaingolfclub\.com/i);
  });

  it('falls back to place-name matching when the CRM category word does not match the real site', () => {
    // CRM entry: "Shannon Lake Golf Club". The real official site
    // (shannonlakegolf.com) titles itself "Shannon Lake Golf Course" and
    // never says "club" anywhere in host or title — the strict pass (which
    // requires every CRM token including "club") finds nothing, so this
    // must fall back to place-name-only matching instead of returning zero
    // candidates for a business a plain web search finds instantly.
    const candidates = toWebsiteSearchCandidates('Shannon Lake Golf Club', [
      {
        url: 'https://www.golfcanada.ca/golf-facility/shannon-lake-golf-club-en/',
        title: 'Shannon Lake Golf Club - Golf Canada',
        snippet: 'Directory listing',
      },
      {
        url: 'https://shannonlakegolf.com/',
        title: 'Shannon Lake Golf Course',
        snippet: "West Kelowna's premier golf destination",
      },
      {
        url: 'https://www.tourismkelowna.com/listing/shannon-lake-golf-club/150/',
        title: 'Shannon Lake Golf Club',
        snippet: 'Tourism Kelowna listing',
      },
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.url).toMatch(/shannonlakegolf\.com/i);
  });

  it('still prefers the strict category-word match over the relaxed fallback when both exist', () => {
    const candidates = toWebsiteSearchCandidates('Black Mountain Golf Club', [
      {
        url: 'https://blackmountaindistillery.com/',
        title: 'Black Mountain Distillery — Craft Spirits',
        snippet: 'Small-batch spirits',
      },
      {
        url: 'https://blackmountaingolfclub.com/',
        title: 'Black Mountain Golf Club',
        snippet: 'Kelowna',
      },
    ]);

    // The strict pass finds "blackmountaingolfclub.com", so the relaxed
    // place-name-only fallback (which would also accept the distillery)
    // never runs.
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.url).toMatch(/blackmountaingolfclub\.com/i);
  });
});

describe('toSocialProfileCandidates', () => {
  it('drops marketplace and groups; collapses posts to parent profiles; ranks name matches first', () => {
    const candidates = toSocialProfileCandidates('facebook', "Buckerfield's Kelowna", [
      {
        url: 'https://facebook.com/marketplace/106956609336424/cacti',
        title: 'Cacti for sale',
        snippet: 'Kelowna',
      },
      {
        url: 'https://facebook.com/groups/kelownabuysellmarketplace/posts/1',
        title: 'Gift set',
        snippet: 'Kelowna',
      },
      {
        url: 'https://facebook.com/cityofkelowna/posts/stage-1',
        title: 'City of Kelowna',
        snippet: 'watering',
      },
      {
        url: 'https://www.facebook.com/Buckerfields/posts/123',
        title: "Buckerfield's Kelowna",
        snippet: 'Garden centre Kelowna',
      },
      {
        url: 'https://www.facebook.com/SpallGolf',
        title: 'SpallGolf',
        snippet: 'Vernon',
      },
    ]);

    expect(candidates.every((c) => !c.url.includes('marketplace'))).toBe(true);
    expect(candidates.every((c) => !c.url.includes('groups'))).toBe(true);
    expect(candidates[0]?.url).toMatch(/facebook\.com\/buckerfields/i);
    expect(candidates.some((c) => c.url.includes('cityofkelowna'))).toBe(true);
  });
});

describe('canonicalizeSocialProfileUrl', () => {
  it('rejects marketplace and builds profile URLs from posts', () => {
    expect(
      canonicalizeSocialProfileUrl(
        'facebook',
        'https://facebook.com/marketplace/106956609336424/cacti',
      ),
    ).toBeNull();
    expect(
      canonicalizeSocialProfileUrl('facebook', 'https://www.facebook.com/SpallGolf/photos'),
    ).toBe('https://facebook.com/spallgolf');
    expect(
      canonicalizeSocialProfileUrl('instagram', 'https://www.instagram.com/spallgolf/p/ABC123/'),
    ).toBe('https://instagram.com/spallgolf');
  });
});
