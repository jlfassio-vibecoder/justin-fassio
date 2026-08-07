import { describe, expect, it } from 'vitest';
import {
  buildCanonicalUrl,
  buildOgrCollectionUrl,
  buildOgrProductPath,
  buildOgrProductUrl,
  normalizeOgrProductSlug,
  OGR_WHOLESALE_PATH,
  resolvePublicSiteOrigin,
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
  });

  it('normalizes before building', () => {
    expect(buildOgrProductPath(' American-Revival ')).toBe(
      `${OGR_WHOLESALE_PATH}/american-revival`,
    );
  });
});

describe('absolute URL builders', () => {
  it('builds collection and product absolute URLs without double slashes', () => {
    expect(buildOgrCollectionUrl('https://justinfassio.com')).toBe(
      'https://justinfassio.com/old-guys-rule-wholesale',
    );
    expect(buildOgrProductUrl('american-revival', 'https://justinfassio.com/')).toBe(
      'https://justinfassio.com/old-guys-rule-wholesale/american-revival',
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
