import { describe, expect, it } from 'vitest';
import type { PublicOgrProduct } from '@/lib/publicCatalog';
import { buildOgrProductMetadata, toLayoutSeoProps } from '@/lib/ogrPageMetadata';
import { resolveOgrProductShareImage } from '@/lib/ogrShareImages';
import {
  buildPublicProductPresentation,
  OGR_PUBLIC_SITE_NAME,
  PUBLIC_PRESENTATION_FORBIDDEN_KEYS,
} from '@/lib/publicProductPresentation';
import { buildOgrProductUrl } from '@/lib/productUrls';

function fixture(partial: Partial<PublicOgrProduct> = {}): PublicOgrProduct {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    sku: 'OG2513',
    publicSlug: 'american-revival-og2513',
    name: 'American Revival',
    cat: 'Short Sleeve Tees',
    color: 'Graphite Heather',
    tagline: 'Great American Revival',
    description: 'Public sales description',
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

describe('ogr card pipeline', () => {
  it('composes presentation → share image → metadata → layout props', () => {
    const presentation = buildPublicProductPresentation(fixture(), { salesVolumeRank: 3 });
    const canonicalUrl = buildOgrProductUrl(presentation.slug, 'https://justinfassio.com');
    const shareImage = resolveOgrProductShareImage({
      presentation,
      lineHeroImageUrl: 'https://cdn.example/hero.jpg',
    });
    const metadata = buildOgrProductMetadata({
      presentation,
      canonicalUrl,
      image: shareImage,
    });
    const layout = toLayoutSeoProps(metadata);

    expect(shareImage).toEqual({
      url: 'https://oldguysrule.com/cdn/shop/files/GAV1_2000x.jpg',
      alt: 'Old Guys Rule American Revival',
    });
    expect(metadata.canonicalUrl).toBe(canonicalUrl);
    expect(layout.canonicalUrl).toBe(canonicalUrl);
    expect(layout.ogImage).toBe(shareImage?.url);
    expect(layout.ogImageAlt).toBe(shareImage?.alt);
    expect(layout.ogSiteName).toBe(OGR_PUBLIC_SITE_NAME);
    expect(layout.ogType).toBe('website');
    expect(layout.title).toBe(presentation.publicShareTitle);
    expect(JSON.stringify(layout)).not.toContain('wholesaleUsd');
    expect(JSON.stringify(layout)).not.toMatch(/US\$13/);
    for (const key of PUBLIC_PRESENTATION_FORBIDDEN_KEYS) {
      expect(layout).not.toHaveProperty(key);
    }
  });

  it('falls back to line hero when primary is missing, and omits when both invalid', () => {
    const noPrimary = buildPublicProductPresentation(fixture({ primaryImageUrl: null }));
    const withHero = resolveOgrProductShareImage({
      presentation: noPrimary,
      lineHeroImageUrl: 'https://cdn.example/hero.jpg',
    });
    expect(withHero?.url).toBe('https://cdn.example/hero.jpg');

    const layoutWithHero = toLayoutSeoProps(
      buildOgrProductMetadata({
        presentation: noPrimary,
        canonicalUrl: buildOgrProductUrl(noPrimary.slug, 'https://justinfassio.com'),
        image: withHero,
      }),
    );
    expect(layoutWithHero.ogImage).toBe('https://cdn.example/hero.jpg');

    const omitted = resolveOgrProductShareImage({
      presentation: noPrimary,
      lineHeroImageUrl: '/relative.jpg',
    });
    expect(omitted).toBeNull();
    const layoutOmitted = toLayoutSeoProps(
      buildOgrProductMetadata({
        presentation: noPrimary,
        canonicalUrl: buildOgrProductUrl(noPrimary.slug, 'https://justinfassio.com'),
        image: omitted,
      }),
    );
    expect(layoutOmitted.ogImage).toBeNull();
    expect(layoutOmitted.ogImageAlt).toBeNull();
  });
});
