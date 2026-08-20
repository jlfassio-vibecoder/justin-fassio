import { describe, expect, it } from 'vitest';
import {
  buildCanonicalUrl,
  buildOgrCollectionUrl,
  buildOgrProductPath,
  buildOgrProductUrl,
  normalizeOgrProductSlug,
  ogrWholesaleHrefForLocation,
  parseOgrWholesaleProductSlug,
  OGR_WHOLESALE_PATH,
  resolvePublicSiteOrigin,
  tryBuildOgrProductPath,
  tryBuildOgrProductUrl,
} from '@/lib/productUrls';

describe('normalizeOgrProductSlug', () => {
  it('trims and lowercases', () => {
    expect(normalizeOgrProductSlug(' American-Revival ')).toBe('american-revival');
  });

  it('throws on empty, slash, query, hash, or whitespace', () => {
    expect(() => normalizeOgrProductSlug('')).toThrow(/required/);
    expect(() => normalizeOgrProductSlug('   ')).toThrow(/required/);
    expect(() => normalizeOgrProductSlug('/')).toThrow(/Invalid/);
    expect(() => normalizeOgrProductSlug('a/b')).toThrow(/Invalid/);
    expect(() => normalizeOgrProductSlug('x?y')).toThrow(/Invalid/);
    expect(() => normalizeOgrProductSlug('x#y')).toThrow(/Invalid/);
    expect(() => normalizeOgrProductSlug('a b')).toThrow(/Invalid/);
  });
});

describe('buildOgrProductPath', () => {
  it('builds the collection product path', () => {
    expect(buildOgrProductPath('american-revival')).toBe(`${OGR_WHOLESALE_PATH}/american-revival`);
    expect(buildOgrProductPath('american-revival', 'us')).toBe(
      `${OGR_WHOLESALE_PATH}/us/american-revival`,
    );
  });

  it('normalizes before building', () => {
    expect(buildOgrProductPath(' American-Revival ')).toBe(
      `${OGR_WHOLESALE_PATH}/american-revival`,
    );
  });

  it('tryBuild helpers return null for invalid slugs instead of throwing', () => {
    expect(tryBuildOgrProductPath('a b')).toBeNull();
    expect(tryBuildOgrProductUrl('a b', 'https://justinfassio.com')).toBeNull();
    expect(tryBuildOgrProductPath('american-revival')).toBe(
      `${OGR_WHOLESALE_PATH}/american-revival`,
    );
  });
});

describe('parseOgrWholesaleProductSlug', () => {
  it('reads CA and US product paths and never treats us as a slug', () => {
    expect(parseOgrWholesaleProductSlug('/old-guys-rule-wholesale/american-revival')).toBe(
      'american-revival',
    );
    expect(parseOgrWholesaleProductSlug('/old-guys-rule-wholesale/us/american-revival')).toBe(
      'american-revival',
    );
    expect(parseOgrWholesaleProductSlug('/old-guys-rule-wholesale')).toBeNull();
    expect(parseOgrWholesaleProductSlug('/old-guys-rule-wholesale/us')).toBeNull();
  });

  it('preserves collection filters when switching markets', () => {
    expect(
      ogrWholesaleHrefForLocation('us', {
        pathname: '/old-guys-rule-wholesale',
        search: '?cat=tees',
      }),
    ).toBe('/old-guys-rule-wholesale/us?cat=tees');
    expect(
      ogrWholesaleHrefForLocation('ca', {
        pathname: '/old-guys-rule-wholesale/us/american-revival',
        search: '',
      }),
    ).toBe('/old-guys-rule-wholesale/american-revival');
    expect(
      ogrWholesaleHrefForLocation('us', {
        pathname: '/old-guys-rule-wholesale/american-revival',
        search: '?cat=tees',
      }),
    ).toBe('/old-guys-rule-wholesale/us/american-revival?cat=tees');
  });
});

describe('absolute URL builders', () => {
  it('builds collection and product absolute URLs without double slashes', () => {
    expect(buildOgrCollectionUrl('https://justinfassio.com')).toBe(
      'https://justinfassio.com/old-guys-rule-wholesale',
    );
    expect(buildOgrCollectionUrl('https://justinfassio.com', 'us')).toBe(
      'https://justinfassio.com/old-guys-rule-wholesale/us',
    );
    expect(buildOgrProductUrl('american-revival', 'https://justinfassio.com/')).toBe(
      'https://justinfassio.com/old-guys-rule-wholesale/american-revival',
    );
    expect(buildOgrProductUrl('american-revival', 'https://justinfassio.com', 'us')).toBe(
      'https://justinfassio.com/old-guys-rule-wholesale/us/american-revival',
    );
  });

  it('strips origin path, query, and hash', () => {
    expect(buildOgrProductUrl('american-revival', 'https://justinfassio.com/app')).toBe(
      'https://justinfassio.com/old-guys-rule-wholesale/american-revival',
    );
    expect(buildOgrCollectionUrl('https://justinfassio.com?x=1#h')).toBe(
      'https://justinfassio.com/old-guys-rule-wholesale',
    );
  });

  it('accepts localhost http origins', () => {
    expect(buildOgrCollectionUrl('http://localhost:4321')).toBe(
      'http://localhost:4321/old-guys-rule-wholesale',
    );
  });

  it('rejects missing protocol and unsupported protocols', () => {
    expect(() => buildCanonicalUrl(OGR_WHOLESALE_PATH, 'justinfassio.com')).toThrow(
      /Invalid origin/,
    );
    expect(() => buildCanonicalUrl(OGR_WHOLESALE_PATH, 'ftp://example.com')).toThrow(
      /Unsupported origin protocol/,
    );
  });

  it('rejects paths with query or hash', () => {
    expect(() =>
      buildCanonicalUrl('/old-guys-rule-wholesale?x=1', 'https://justinfassio.com'),
    ).toThrow(/query or hash/);
  });

  it('builds canonical product URLs without query or hash', () => {
    expect(buildOgrProductUrl('american-revival', 'https://justinfassio.com', 'us')).toBe(
      'https://justinfassio.com/old-guys-rule-wholesale/us/american-revival',
    );
    expect(buildOgrProductUrl('american-revival', 'https://justinfassio.com', 'us')).not.toMatch(
      /[?#]/,
    );
    expect(buildOgrProductUrl('american-revival', 'https://justinfassio.com')).not.toMatch(/[?#]/);
  });

  it('never adds tracking params and is deterministic', () => {
    const a = buildOgrProductUrl('american-revival', 'https://justinfassio.com');
    const b = buildOgrProductUrl('american-revival', 'https://justinfassio.com');
    expect(a).toBe(b);
    expect(a).not.toMatch(/utm_/);
  });
});

describe('resolvePublicSiteOrigin', () => {
  it('prefers explicitOrigin over env and request', () => {
    expect(
      resolvePublicSiteOrigin({
        explicitOrigin: 'https://explicit.example',
        envSiteUrl: 'https://env.example',
        requestOrigin: 'https://request.example',
      }),
    ).toBe('https://explicit.example');
  });

  it('prefers env over request when explicit is absent', () => {
    expect(
      resolvePublicSiteOrigin({
        envSiteUrl: 'https://env.example/',
        requestOrigin: 'https://request.example',
      }),
    ).toBe('https://env.example');
  });

  it('uses requestOrigin when env is empty', () => {
    expect(
      resolvePublicSiteOrigin({
        envSiteUrl: '',
        requestOrigin: 'http://localhost:4321',
      }),
    ).toBe('http://localhost:4321');
  });

  it('falls back to justinfassio.com when all candidates are empty', () => {
    expect(
      resolvePublicSiteOrigin({
        explicitOrigin: null,
        envSiteUrl: '',
        requestOrigin: '   ',
      }),
    ).toBe('https://justinfassio.com');
  });

  it('throws when a provided non-empty candidate is malformed', () => {
    expect(() => resolvePublicSiteOrigin({ explicitOrigin: 'not-a-url' })).toThrow(
      /Invalid origin/,
    );
  });
});
