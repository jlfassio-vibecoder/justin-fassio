import { describe, expect, it } from 'vitest';
import { OGR_WHOLESALE_PATH } from '@/data/landing';
import { BEST_SELLER_BADGE_MAX_RANK } from '@/lib/crmRetailTaxonomy';
import type { PublicOgrProduct } from '@/lib/publicCatalog';
import {
  buildPublicProductPresentation,
  OGR_PUBLIC_BRAND_NAME,
  OGR_PUBLIC_COLLECTION_PATH,
  OGR_PUBLIC_SITE_NAME,
  PUBLIC_PRESENTATION_FORBIDDEN_KEYS,
} from '@/lib/publicProductPresentation';
import { RETAIL_PRICE_DISCLAIMER } from '@/lib/wholesalePricing';

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
    alternateImageUrls: ['https://oldguysrule.com/cdn/shop/files/GAV5_2000x.jpg'],
    unitOfMeasure: 'each',
    minimumQuantity: null,
    orderMultiple: null,
    packQuantity: null,
    lifestyleThemes: ['fishing', 'retirement'],
    liveSku: null,
    availableSizes: ['M-XL', '2X'],
    ...partial,
  };
}

describe('buildPublicProductPresentation', () => {
  it('maps core identity and copy fields', () => {
    const presentation = buildPublicProductPresentation(fixture());
    expect(presentation.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(presentation.sku).toBe('OG2513');
    expect(presentation.slug).toBe('american-revival-og2513');
    expect(presentation.name).toBe('American Revival');
    expect(presentation.category).toBe('Short Sleeve Tees');
    expect(presentation.color).toBe('Graphite Heather');
    expect(presentation.tagline).toBe('Great American Revival');
    expect(presentation.description).toBe('Public sales description');
    expect(presentation.isNew).toBe(true);
    expect(presentation.isFeatured).toBe(false);
  });

  it('trims whitespace and uses empty strings for missing copy', () => {
    const presentation = buildPublicProductPresentation(
      fixture({
        name: '  American Revival  ',
        tagline: '   ',
        description: '',
        color: '  ',
        publicSlug: '  american-revival-og2513  ',
      }),
    );
    expect(presentation.name).toBe('American Revival');
    expect(presentation.tagline).toBe('');
    expect(presentation.description).toBe('');
    expect(presentation.color).toBe('');
    expect(presentation.slug).toBe('american-revival-og2513');
  });

  it('keeps stored canonical lifestyle themes and parallel labels', () => {
    const presentation = buildPublicProductPresentation(
      fixture({ lifestyleThemes: ['golf', 'beer', 'golf', 'nope'] }),
    );
    expect(presentation.lifestyleThemes).toEqual(['golf', 'beer']);
    expect(presentation.lifestyleThemeLabels).toHaveLength(presentation.lifestyleThemes.length);
    expect(presentation.lifestyleThemeLabels[0]).toBeTruthy();
  });

  it('infers themes from copy when stored themes are empty', () => {
    const presentation = buildPublicProductPresentation(
      fixture({
        lifestyleThemes: [],
        name: 'Dockside Captain Tee',
        tagline: 'Life on the boat',
        description: '',
      }),
    );
    expect(presentation.lifestyleThemes.length).toBeGreaterThan(0);
    expect(presentation.lifestyleThemes).not.toContain('golf_retail');
  });

  it('derives isBestSeller from explicit rank context only', () => {
    expect(buildPublicProductPresentation(fixture(), { salesVolumeRank: 1 }).isBestSeller).toBe(
      true,
    );
    expect(
      buildPublicProductPresentation(fixture(), { salesVolumeRank: BEST_SELLER_BADGE_MAX_RANK })
        .isBestSeller,
    ).toBe(true);
    expect(buildPublicProductPresentation(fixture(), { salesVolumeRank: 33 }).isBestSeller).toBe(
      false,
    );
    expect(buildPublicProductPresentation(fixture(), { salesVolumeRank: 33 }).salesVolumeRank).toBe(
      33,
    );
    expect(buildPublicProductPresentation(fixture()).salesVolumeRank).toBeNull();
    expect(buildPublicProductPresentation(fixture()).isBestSeller).toBe(false);
    expect(
      buildPublicProductPresentation(fixture(), { salesVolumeRank: 0 }).salesVolumeRank,
    ).toBeNull();
    expect(
      buildPublicProductPresentation(fixture(), { salesVolumeRank: Number.NaN }).isBestSeller,
    ).toBe(false);
  });

  it('normalizes primary image and gallery urls', () => {
    const withPrimary = buildPublicProductPresentation(fixture());
    expect(withPrimary.primaryImageUrl).toBe(
      'https://oldguysrule.com/cdn/shop/files/GAV1_2000x.jpg',
    );
    expect(withPrimary.primaryImageAlt).toBe('American Revival');
    expect(withPrimary.galleryImageUrls).toEqual([
      'https://oldguysrule.com/cdn/shop/files/GAV1_2000x.jpg',
      'https://oldguysrule.com/cdn/shop/files/GAV5_2000x.jpg',
    ]);

    const missing = buildPublicProductPresentation(
      fixture({ primaryImageUrl: null, alternateImageUrls: [] }),
    );
    expect(missing.primaryImageUrl).toBeNull();
    expect(missing.galleryImageUrls).toEqual([]);

    const whitespace = buildPublicProductPresentation(
      fixture({
        primaryImageUrl: '   ',
        alternateImageUrls: ['', '  ', 'https://cdn.example/a.jpg', 'https://cdn.example/a.jpg'],
      }),
    );
    expect(whitespace.primaryImageUrl).toBeNull();
    expect(whitespace.galleryImageUrls).toEqual(['https://cdn.example/a.jpg']);
  });

  it('builds public suggested retail from MSRP without exposing wholesale', () => {
    const presentation = buildPublicProductPresentation(fixture({ msrpCad: 39.99 }));
    expect(presentation.suggestedRetail).not.toBeNull();
    expect(presentation.suggestedRetail?.lowCad).toBe(39.99);
    expect(presentation.suggestedRetail?.display).toContain('C$');
    expect(presentation.suggestedRetail?.disclaimer).toBe(RETAIL_PRICE_DISCLAIMER);

    const none = buildPublicProductPresentation(fixture({ msrpCad: 0 }));
    expect(none.suggestedRetail).toBeNull();
  });

  it('builds share title and description with Astro precedence', () => {
    const withTagline = buildPublicProductPresentation(fixture());
    expect(withTagline.publicShareTitle).toBe(
      `American Revival | ${OGR_PUBLIC_BRAND_NAME} Wholesale | ${OGR_PUBLIC_SITE_NAME}`,
    );
    expect(withTagline.publicShareDescription).toBe('Great American Revival');

    const withDescriptionOnly = buildPublicProductPresentation(
      fixture({ tagline: '', description: 'Longer sales copy' }),
    );
    expect(withDescriptionOnly.publicShareDescription).toBe('Longer sales copy');

    const fallback = buildPublicProductPresentation(fixture({ tagline: '', description: '' }));
    expect(fallback.publicShareDescription).toBe(
      `American Revival (OG2513) — wholesale for Canadian retailers via ${OGR_PUBLIC_SITE_NAME}.`,
    );
  });

  it('drops CAD retail numbers and Canadian-retailer copy for the U.S. market', () => {
    const presentation = buildPublicProductPresentation(fixture({ msrpCad: 39.99 }), {
      publicMarket: 'us',
    });
    expect(presentation.suggestedRetail).toBeNull();
    expect(JSON.stringify(presentation)).not.toMatch(
      /C\$|Typical Canadian retail|Wholesale Canada/,
    );

    const fallback = buildPublicProductPresentation(
      fixture({ tagline: '', description: '', msrpCad: 39.99 }),
      { publicMarket: 'us' },
    );
    expect(fallback.publicShareDescription).toBe(
      `American Revival (OG2513) — wholesale for retailers via ${OGR_PUBLIC_SITE_NAME}.`,
    );
    expect(fallback.publicShareDescription).not.toContain('Canadian retailers');
  });

  it('never leaks wholesale or staff fields onto the presentation object', () => {
    const presentation = buildPublicProductPresentation(fixture({ wholesaleUsd: 13 }));
    expect(presentation).not.toHaveProperty('wholesaleUsd');
    const keys = Object.keys(presentation);
    for (const forbidden of PUBLIC_PRESENTATION_FORBIDDEN_KEYS) {
      expect(keys).not.toContain(forbidden);
    }
    expect(keys).not.toContain('availableSizes');
    expect(keys).not.toContain('publicSortOrder');
    expect(keys).not.toContain('msrpCad');
  });

  it('does not mutate the source DTO and is deterministic', () => {
    const product = fixture({ wholesaleUsd: 13, lifestyleThemes: ['fishing'] });
    const snapshot = structuredClone(product);
    const a = buildPublicProductPresentation(product, { salesVolumeRank: 5 });
    const b = buildPublicProductPresentation(product, { salesVolumeRank: 5 });
    expect(product).toEqual(snapshot);
    expect(a).toEqual(b);
    a.lifestyleThemes.push('hacked');
    expect(product.lifestyleThemes).toEqual(['fishing']);
  });

  it('exports brand/site/collection constants for future presenters', () => {
    expect(OGR_PUBLIC_SITE_NAME).toBe('Justin Fassio');
    expect(OGR_PUBLIC_BRAND_NAME).toBe('Old Guys Rule');
    expect(OGR_PUBLIC_COLLECTION_PATH).toBe(OGR_WHOLESALE_PATH);
  });
});
