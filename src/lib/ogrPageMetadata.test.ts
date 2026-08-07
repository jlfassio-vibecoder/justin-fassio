import { describe, expect, it } from 'vitest';
import type { PublicOgrProduct } from '@/lib/publicCatalog';
import {
  buildOgrCollectionMetadata,
  buildOgrProductMetadata,
  isPublicAbsoluteImageUrl,
  toLayoutSeoProps,
} from '@/lib/ogrPageMetadata';
import {
  buildPublicProductPresentation,
  OGR_PUBLIC_SITE_NAME,
  PUBLIC_PRESENTATION_FORBIDDEN_KEYS,
} from '@/lib/publicProductPresentation';

function fixture(partial: Partial<PublicOgrProduct> = {}): PublicOgrProduct {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    sku: 'OG2513',
    publicSlug: 'american-revival-og2513',
    name: 'American Revival',
    cat: 'Short Sleeve Tees',
    color: 'Graphite Heather',
    tagline: 'Great American Revival',
    description: 'Public sales\ndescription  with   spaces',
    page: 4,
    catalogYear: 2026,
    collection: '',
    wholesaleUsd: 13,
    msrpCad: 39.99,
    isNew: true,
    featured: false,
    publicSortOrder: 10,
    primaryImageUrl: 'https://oldguysrule.com/cdn/shop/files/GAV1_2000x.jpg',
    alternateImageUrls: [],
    unitOfMeasure: 'each',
    minimumQuantity: null,
    orderMultiple: null,
    packQuantity: null,
    lifestyleThemes: ['fishing'],
    liveSku: null,
    availableSizes: ['M-XL'],
    ...partial,
  };
}

describe('isPublicAbsoluteImageUrl', () => {
  it('accepts http(s) absolute URLs only', () => {
    expect(isPublicAbsoluteImageUrl('https://cdn.example/a.jpg')).toBe(true);
    expect(isPublicAbsoluteImageUrl('http://localhost:4321/a.jpg')).toBe(true);
    expect(isPublicAbsoluteImageUrl('/relative.jpg')).toBe(false);
    expect(isPublicAbsoluteImageUrl('')).toBe(false);
    expect(isPublicAbsoluteImageUrl(null)).toBe(false);
    expect(isPublicAbsoluteImageUrl('ftp://cdn.example/a.jpg')).toBe(false);
  });
});

describe('buildOgrProductMetadata', () => {
  it('maps presentation share fields and absolute image', () => {
    const presentation = buildPublicProductPresentation(fixture());
    const canonicalUrl = 'https://justinfassio.com/old-guys-rule-wholesale/american-revival-og2513';
    const metadata = buildOgrProductMetadata({ presentation, canonicalUrl });

    expect(metadata.title).toBe(presentation.publicShareTitle);
    expect(metadata.description).toBe('Great American Revival');
    expect(metadata.canonicalUrl).toBe(canonicalUrl);
    expect(metadata.siteName).toBe(OGR_PUBLIC_SITE_NAME);
    expect(metadata.ogType).toBe('website');
    expect(metadata.image).toEqual({
      url: 'https://oldguysrule.com/cdn/shop/files/GAV1_2000x.jpg',
      alt: 'American Revival',
    });
  });

  it('collapses whitespace in share description when tagline is empty', () => {
    const presentation = buildPublicProductPresentation(
      fixture({
        tagline: '',
        description: 'Public sales\ndescription  with   spaces',
      }),
    );
    const metadata = buildOgrProductMetadata({
      presentation,
      canonicalUrl: 'https://justinfassio.com/old-guys-rule-wholesale/american-revival-og2513',
    });
    expect(metadata.description).toBe('Public sales description with spaces');
  });

  it('omits image when primary URL is not absolute http(s)', () => {
    const presentation = buildPublicProductPresentation(
      fixture({ primaryImageUrl: '/local/image.jpg' }),
    );
    const metadata = buildOgrProductMetadata({
      presentation,
      canonicalUrl: 'https://justinfassio.com/old-guys-rule-wholesale/american-revival-og2513',
    });
    expect(metadata.image).toBeNull();
  });

  it('never leaks wholesale or staff fields', () => {
    const presentation = buildPublicProductPresentation(fixture({ wholesaleUsd: 13 }));
    const metadata = buildOgrProductMetadata({
      presentation,
      canonicalUrl: 'https://justinfassio.com/old-guys-rule-wholesale/american-revival-og2513',
    });
    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain('wholesaleUsd');
    expect(serialized).not.toMatch(/US\$13/);
    expect(serialized).not.toContain('utm_');
    for (const key of PUBLIC_PRESENTATION_FORBIDDEN_KEYS) {
      expect(metadata).not.toHaveProperty(key);
    }
  });

  it('uses explicit image override when provided, including null', () => {
    const presentation = buildPublicProductPresentation(fixture());
    const canonicalUrl = 'https://justinfassio.com/old-guys-rule-wholesale/american-revival-og2513';
    const override = {
      url: 'https://cdn.example/hero.jpg',
      alt: 'Old Guys Rule wholesale collection',
    };
    expect(buildOgrProductMetadata({ presentation, canonicalUrl, image: override }).image).toEqual(
      override,
    );
    expect(buildOgrProductMetadata({ presentation, canonicalUrl, image: null }).image).toBeNull();
  });
});

describe('buildOgrCollectionMetadata', () => {
  it('uses default title and line description when present', () => {
    const metadata = buildOgrCollectionMetadata({
      canonicalUrl: 'https://justinfassio.com/old-guys-rule-wholesale',
      line: {
        name: 'Old Guys Rule',
        tagline: 'Now Repping',
        description: 'Men’s lifestyle apparel for Canadian retailers.',
        heroImageUrl: 'https://cdn.example/hero.jpg',
      },
    });
    expect(metadata.title).toBe('Old Guys Rule Wholesale Canada | Justin Fassio');
    expect(metadata.description).toBe('Men’s lifestyle apparel for Canadian retailers.');
    expect(metadata.image).toEqual({
      url: 'https://cdn.example/hero.jpg',
      alt: 'Old Guys Rule wholesale collection',
    });
  });

  it('falls back to tagline then default blurb; omits invalid hero', () => {
    const withTagline = buildOgrCollectionMetadata({
      canonicalUrl: 'https://justinfassio.com/old-guys-rule-wholesale',
      line: {
        name: 'Old Guys Rule',
        tagline: 'Now Repping',
        description: null,
        heroImageUrl: '/relative-hero.jpg',
      },
    });
    expect(withTagline.description).toBe('Now Repping');
    expect(withTagline.image).toBeNull();

    const fallback = buildOgrCollectionMetadata({
      canonicalUrl: 'https://justinfassio.com/old-guys-rule-wholesale',
      line: null,
    });
    expect(fallback.description).toContain('Canadian retailers');
    expect(fallback.image).toBeNull();
  });

  it('uses explicit image override when provided, including null', () => {
    const line = {
      name: 'Old Guys Rule',
      tagline: 'Now Repping',
      description: 'Men’s lifestyle apparel for Canadian retailers.',
      heroImageUrl: 'https://cdn.example/hero.jpg',
    };
    const override = {
      url: 'https://cdn.example/override.jpg',
      alt: 'Custom share alt',
    };
    expect(
      buildOgrCollectionMetadata({
        canonicalUrl: 'https://justinfassio.com/old-guys-rule-wholesale',
        line,
        image: override,
      }).image,
    ).toEqual(override);
    expect(
      buildOgrCollectionMetadata({
        canonicalUrl: 'https://justinfassio.com/old-guys-rule-wholesale',
        line,
        image: null,
      }).image,
    ).toBeNull();
  });
});

describe('toLayoutSeoProps', () => {
  it('maps metadata into Layout flat props', () => {
    const presentation = buildPublicProductPresentation(fixture());
    const metadata = buildOgrProductMetadata({
      presentation,
      canonicalUrl: 'https://justinfassio.com/old-guys-rule-wholesale/american-revival-og2513',
    });
    expect(toLayoutSeoProps(metadata)).toEqual({
      title: metadata.title,
      description: metadata.description,
      canonicalUrl: metadata.canonicalUrl,
      ogImage: metadata.image?.url ?? null,
      ogImageAlt: metadata.image?.alt ?? null,
      ogSiteName: OGR_PUBLIC_SITE_NAME,
      ogType: 'website',
    });
  });
});
