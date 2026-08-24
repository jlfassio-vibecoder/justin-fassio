import { describe, expect, it } from 'vitest';
import { extractSocialLinksFromHtml } from '@/lib/accountResearch/officialWebsiteSocialLinks';
import {
  attributeInstagramPost,
  attributeTikTokPost,
  buildSocialSearchQuery,
  extractHandleFromLockedUrl,
  hasConflictingGeography,
  selectFirstProfileFromSearchResults,
} from '@/lib/accountResearch/socialProfile';
import {
  SPALLUMCHEEN_CONFIRMED_HANDLE,
  SPALLUMCHEEN_INSTAGRAM_NOISE,
} from '@/lib/accountResearch/fixtures/spallumcheenSocialNoise';

describe('buildSocialSearchQuery', () => {
  it('uses quoted business name, official page intent, and site: host', () => {
    expect(buildSocialSearchQuery('instagram', 'Acme Golf')).toBe(
      '"Acme Golf" official Instagram profile site:instagram.com',
    );
    expect(buildSocialSearchQuery('facebook', 'Trail Outfitters')).toBe(
      '"Trail Outfitters" official Facebook page site:facebook.com',
    );
    expect(buildSocialSearchQuery('tiktok', 'Trail Outfitters')).toBe(
      '"Trail Outfitters" official TikTok profile site:tiktok.com',
    );
    expect(buildSocialSearchQuery('pinterest', 'Trail Outfitters')).toBe(
      '"Trail Outfitters" official Pinterest profile site:pinterest.com',
    );
  });

  it('does not include geo qualifiers beyond the business name', () => {
    const query = buildSocialSearchQuery('instagram', 'Spallumcheen Golf & Country Club');
    expect(query).toBe(
      '"Spallumcheen Golf & Country Club" official Instagram profile site:instagram.com',
    );
    expect(query).not.toMatch(/Vernon|British Columbia|Canada/i);
  });
});

describe('selectFirstProfileFromSearchResults', () => {
  it('skips unrelated profiles and selects the first name-matching profile', () => {
    const profile = selectFirstProfileFromSearchResults(
      'instagram',
      [
        {
          url: 'https://instagram.com/reel/ABC123',
          title: 'Reel',
          excerpt: 'Not a profile',
        },
        {
          url: 'https://instagram.com/wrongclub',
          title: 'Wrong Club',
          excerpt: 'Vernon NJ',
        },
        {
          url: 'https://instagram.com/spallumcheengolf',
          title: 'Spallumcheen Golf',
          excerpt: 'Welcome',
        },
      ],
      'Spallumcheen Golf & Country Club',
    );
    expect(profile?.handle).toBe('spallumcheengolf');
    expect(profile?.profileUrl).toBe('https://instagram.com/spallumcheengolf');
    expect(profile?.resolutionMethod).toBe('profile_search');
  });

  it('does not select facebook.com/TheCountryClubID for Spallumcheen', () => {
    expect(
      selectFirstProfileFromSearchResults(
        'facebook',
        [
          {
            url: 'https://www.facebook.com/TheCountryClubID/',
            title: 'The Country Club',
            excerpt: 'Idaho golf and country club',
          },
          {
            url: 'https://www.facebook.com/SpallumcheenGolf/',
            title: 'Spallumcheen Golf & Country Club',
            excerpt: 'Vernon',
          },
        ],
        'Spallumcheen Golf & Country Club',
      )?.profileUrl,
    ).toBe('https://www.facebook.com/SpallumcheenGolf/');
  });

  it('returns no profile when only a generic Country Club page is present', () => {
    expect(
      selectFirstProfileFromSearchResults(
        'facebook',
        [
          {
            url: 'https://www.facebook.com/TheCountryClubID/',
            title: 'The Country Club',
            excerpt: 'Welcome',
          },
        ],
        'Spallumcheen Golf & Country Club',
      ),
    ).toBeNull();
  });

  it('selects abbreviated Instagram handle when SERP title has the business name', () => {
    const profile = selectFirstProfileFromSearchResults(
      'instagram',
      [
        {
          url: 'https://www.instagram.com/spallgolf/',
          title: 'Spallumcheen Golf & Country Club (@spallgolf) · Vernon, BC',
          excerpt: 'Phone: (250) 545 5824 Online: www.spallumcheengolf.com',
        },
      ],
      'Spallumcheen Golf & Country Club',
    );
    expect(profile?.handle).toBe('spallgolf');
  });

  it('selects Facebook photos-tab URL as the page when SERP names the business', () => {
    const profile = selectFirstProfileFromSearchResults(
      'facebook',
      [
        {
          url: 'https://www.facebook.com/SpallGolf/photos',
          title: 'Spallumcheen Golf & Country Club (@SpallGolf) - Photos',
          excerpt: 'Vernon. 2127 likes',
        },
      ],
      'Spallumcheen Golf & Country Club',
    );
    expect(profile?.handle).toBe('spallgolf');
  });

  it('accepts a SERP profile whose snippet cites the official website', () => {
    const profile = selectFirstProfileFromSearchResults(
      'instagram',
      [
        {
          url: 'https://www.instagram.com/spallgolf/',
          title: '@spallgolf',
          excerpt: 'Book a tee time at www.spallumcheengolf.com',
        },
      ],
      'Spallumcheen Golf & Country Club',
      'spallumcheengolf.com',
    );
    expect(profile?.handle).toBe('spallgolf');
  });

  it('skips post and reel URLs until a profile is found', () => {
    const profile = selectFirstProfileFromSearchResults(
      'instagram',
      [
        { url: 'https://instagram.com/reel/DaOqjqEpIR9', title: 'Reel', excerpt: '' },
        { url: 'https://instagram.com/p/ABC123', title: 'Post', excerpt: '' },
        { url: 'https://instagram.com/trailoutfitters', title: 'Trail Outfitters', excerpt: '' },
      ],
      'Trail Outfitters',
    );
    expect(profile?.handle).toBe('trailoutfitters');
  });

  it('selects Facebook /p/ page URLs as the first valid profile', () => {
    const profile = selectFirstProfileFromSearchResults(
      'facebook',
      [
        {
          url: 'https://www.facebook.com/p/Buckerfields-Kelowna-100063512345/',
          title: "Buckerfield's Kelowna",
          excerpt: '1.2K followers',
        },
      ],
      "Buckerfield's Kelowna",
    );
    expect(profile?.handle).toBe('buckerfields-kelowna-100063512345');
    expect(profile?.profileUrl).toContain('/p/Buckerfields-Kelowna-100063512345');
  });

  it('rejects Facebook post URLs as profiles', () => {
    expect(
      selectFirstProfileFromSearchResults(
        'facebook',
        [
          {
            url: 'https://www.facebook.com/BuckerfieldsKelowna/posts/123',
            title: 'Post',
            excerpt: '',
          },
        ],
        "Buckerfield's Kelowna",
      ),
    ).toBeNull();
  });

  it('returns null when no profile URLs are present (no fabricated URL)', () => {
    expect(
      selectFirstProfileFromSearchResults(
        'instagram',
        [
          { url: 'https://instagram.com/reel/DaOqjqEpIR9', title: 'Reel', excerpt: '' },
          { url: 'https://instagram.com/p/ABC123', title: 'Post', excerpt: '' },
        ],
        'Spallumcheen Golf & Country Club',
      ),
    ).toBeNull();
  });
});

describe('socialProfile Spallumcheen post attribution', () => {
  it('rejects all audited Instagram noise URLs for handle attribution', () => {
    for (const row of SPALLUMCHEEN_INSTAGRAM_NOISE) {
      const result = attributeInstagramPost(row.url, SPALLUMCHEEN_CONFIRMED_HANDLE);
      expect(result.verified).toBe(false);
    }
  });

  it('accepts posts under confirmed profile path prefix', () => {
    expect(
      attributeInstagramPost(
        'https://instagram.com/spallumcheengolf/p/ABC123/',
        SPALLUMCHEEN_CONFIRMED_HANDLE,
      ).verified,
    ).toBe(true);
  });

  it('detects conflicting geography patterns', () => {
    expect(hasConflictingGeography('event in Vernon, NJ')).toBe(true);
    expect(hasConflictingGeography('Vernon British Columbia')).toBe(false);
  });

  it('accepts TikTok posts with handle in path', () => {
    const result = attributeTikTokPost(
      'https://www.tiktok.com/@spallumcheengolf/video/123',
      'spallumcheengolf',
    );
    expect(result.verified).toBe(true);
  });
});

describe('officialWebsiteSocialLinks', () => {
  it('extracts instagram profile from anchor and json-ld sameAs', () => {
    const html = `
      <html><head>
        <script type="application/ld+json">{"sameAs":["https://www.instagram.com/spallumcheengolf/"]}</script>
      </head><body>
        <a href="https://facebook.com/spallumcheengolf">FB</a>
      </body></html>
    `;
    const links = extractSocialLinksFromHtml(html);
    expect(links.instagram?.handle).toBe('spallumcheengolf');
    expect(links.instagram?.source).toBe('json_ld_sameAs');
    expect(links.facebook?.handle).toBe('spallumcheengolf');
  });
});

describe('extractHandleFromLockedUrl', () => {
  it('extracts facebook photos-tab and instagram post handles', () => {
    expect(
      extractHandleFromLockedUrl('facebook', 'https://www.facebook.com/SpallGolf/photos'),
    ).toBe('spallgolf');
    expect(
      extractHandleFromLockedUrl('instagram', 'https://www.instagram.com/spallgolf/p/ABC123/'),
    ).toBe('spallgolf');
  });
});
