import { describe, expect, it } from 'vitest';
import type { PublicOgrProduct } from '@/lib/publicCatalog';
import { resolveOgrCollectionShareImage, resolveOgrProductShareImage } from '@/lib/ogrShareImages';
import { buildPublicProductPresentation } from '@/lib/publicProductPresentation';

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

describe('resolveOgrProductShareImage', () => {
  it('prefers absolute primary image with branded alt', () => {
    const presentation = buildPublicProductPresentation(fixture());
    expect(
      resolveOgrProductShareImage({
        presentation,
        lineHeroImageUrl: 'https://cdn.example/hero.jpg',
      }),
    ).toEqual({
      url: 'https://oldguysrule.com/cdn/shop/files/GAV1_2000x.jpg',
      alt: 'Old Guys Rule American Revival',
    });
  });

  it('falls back to absolute line hero when primary is missing', () => {
    const presentation = buildPublicProductPresentation(fixture({ primaryImageUrl: null }));
    expect(
      resolveOgrProductShareImage({
        presentation,
        lineHeroImageUrl: 'https://cdn.example/hero.jpg',
      }),
    ).toEqual({
      url: 'https://cdn.example/hero.jpg',
      alt: 'Old Guys Rule wholesale collection',
    });
  });

  it('omits image when primary and hero are invalid', () => {
    const presentation = buildPublicProductPresentation(
      fixture({ primaryImageUrl: '/relative.jpg' }),
    );
    expect(
      resolveOgrProductShareImage({
        presentation,
        lineHeroImageUrl: 'not-a-url',
      }),
    ).toBeNull();
  });
});

describe('resolveOgrCollectionShareImage', () => {
  it('uses absolute line hero', () => {
    expect(
      resolveOgrCollectionShareImage({
        lineName: 'Old Guys Rule',
        lineHeroImageUrl: 'https://cdn.example/hero.jpg',
      }),
    ).toEqual({
      url: 'https://cdn.example/hero.jpg',
      alt: 'Old Guys Rule wholesale collection',
    });
  });

  it('omits when hero is missing or relative', () => {
    expect(
      resolveOgrCollectionShareImage({
        lineName: 'Old Guys Rule',
        lineHeroImageUrl: null,
      }),
    ).toBeNull();
    expect(
      resolveOgrCollectionShareImage({
        lineName: 'Old Guys Rule',
        lineHeroImageUrl: '/hero.jpg',
      }),
    ).toBeNull();
  });
});
