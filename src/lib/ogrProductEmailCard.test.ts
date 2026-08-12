import { describe, expect, it } from 'vitest';
import type { PublicOgrProduct } from '@/lib/publicCatalog';
import { renderOgrProductEmailCard } from '@/lib/ogrProductEmailCard';
import {
  buildPublicProductPresentation,
  PUBLIC_PRESENTATION_FORBIDDEN_KEYS,
} from '@/lib/publicProductPresentation';

const HREF = 'https://justinfassio.com/old-guys-rule-wholesale/american-revival-og2513';

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
    featured: true,
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

describe('renderOgrProductEmailCard', () => {
  it('renders a complete featured card with image, badges, meta, tagline, and CTA', () => {
    const presentation = buildPublicProductPresentation(fixture(), { salesVolumeRank: 3 });
    const html = renderOgrProductEmailCard(presentation, { href: HREF });

    expect(html).toContain('role="presentation"');
    expect(html).toContain('Old Guys Rule');
    expect(html).toContain('Wholesale');
    expect(html).toContain('background-color:#111111');
    expect(html).toContain('border-bottom:3px solid #c4a35a');
    expect(html).toContain('font-size:20px');
    expect(html).toContain('letter-spacing:0.14em');
    expect(html).toContain('American Revival');
    expect(html).toContain('OG2513 · Short Sleeve Tees · Graphite Heather');
    expect(html).toContain('Great American Revival');
    expect(html).toContain('#3 Best Seller');
    expect(html).toContain('New');
    expect(html).toContain('Featured');
    expect(html).toContain('View Details');
    expect(html).toContain('justinfassio.com');
    expect(html).toContain(`href="${HREF}"`);
    expect(html).toContain('https://oldguysrule.com/cdn/shop/files/GAV1_2000x.jpg');
    expect(html).toContain('width="560"');
    expect(html).toContain('display:block');
    expect(html).not.toContain('display:flex');
    expect(html).not.toContain('display:grid');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('Typical Canadian retail');
    expect(html).not.toContain('Fishing');
    // Brand lives in the masthead, not as a tiny gray eyebrow above the product name.
    expect(html).not.toContain(
      'font-size:11px;line-height:1.3;letter-spacing:0.08em;text-transform:uppercase;color:#888888',
    );
  });

  it('omits img when primary is not absolute and imageUrl is omitted', () => {
    const presentation = buildPublicProductPresentation(
      fixture({ primaryImageUrl: '/relative.jpg' }),
    );
    const html = renderOgrProductEmailCard(presentation, { href: HREF });
    expect(html).not.toContain('<img');
    expect(html).toContain('American Revival');
    expect(html).toContain('View Details');
  });

  it('omits img for relative or javascript imageUrl overrides', () => {
    const presentation = buildPublicProductPresentation(fixture());
    expect(
      renderOgrProductEmailCard(presentation, {
        href: HREF,
        imageUrl: '/relative.jpg',
      }),
    ).not.toContain('<img');
    expect(
      renderOgrProductEmailCard(presentation, {
        href: HREF,
        imageUrl: 'javascript:alert(1)',
      }),
    ).not.toContain('<img');
  });

  it('uses override imageUrl when absolute', () => {
    const presentation = buildPublicProductPresentation(fixture());
    const html = renderOgrProductEmailCard(presentation, {
      href: HREF,
      imageUrl: 'https://cdn.example/override.jpg',
    });
    expect(html).toContain('https://cdn.example/override.jpg');
    expect(html).toContain('alt="Old Guys Rule American Revival"');
  });

  it('omits best-seller badge without rank', () => {
    const presentation = buildPublicProductPresentation(fixture());
    const html = renderOgrProductEmailCard(presentation, { href: HREF });
    expect(html).not.toContain('Best Seller');
    expect(html).toContain('New');
    expect(html).toContain('Featured');
  });

  it('omits empty tagline block', () => {
    const presentation = buildPublicProductPresentation(fixture({ tagline: '' }));
    const html = renderOgrProductEmailCard(presentation, { href: HREF });
    expect(html).not.toContain('Great American Revival');
  });

  it('escapes special characters in text and attributes', () => {
    const presentation = buildPublicProductPresentation(
      fixture({
        name: `A & B <C> "D" 'E'`,
        tagline: `Tag <script> & "x"`,
        sku: 'OG&1',
        cat: 'Tees <X>',
        color: `Blue "Heather"`,
      }),
    );
    const html = renderOgrProductEmailCard(presentation, {
      href: HREF,
      ctaLabel: `View "Details" & more`,
    });
    expect(html).toContain('A &amp; B &lt;C&gt; &quot;D&quot; &#39;E&#39;');
    expect(html).toContain('Tag &lt;script&gt; &amp; &quot;x&quot;');
    expect(html).toContain('View &quot;Details&quot; &amp; more');
    expect(html).not.toContain('<script>');
  });

  it('throws when href is not absolute http(s)', () => {
    const presentation = buildPublicProductPresentation(fixture());
    expect(() => renderOgrProductEmailCard(presentation, { href: '/relative' })).toThrow(
      /absolute http\(s\)/i,
    );
    expect(() => renderOgrProductEmailCard(presentation, { href: 'javascript:alert(1)' })).toThrow(
      /absolute http\(s\)/i,
    );
  });

  it('never leaks wholesale or forbidden presentation keys', () => {
    const presentation = buildPublicProductPresentation(fixture({ wholesaleUsd: 13 }), {
      salesVolumeRank: 1,
    });
    const html = renderOgrProductEmailCard(presentation, { href: HREF });
    expect(html).not.toContain('wholesaleUsd');
    expect(html).not.toMatch(/US\$13/);
    expect(html).not.toContain('buyer');
    expect(html).not.toContain('likes');
    expect(html).not.toContain('utm_');
    for (const key of PUBLIC_PRESENTATION_FORBIDDEN_KEYS) {
      expect(html).not.toContain(key);
    }
  });

  it('links image, title, and CTA separately to the same href', () => {
    const presentation = buildPublicProductPresentation(fixture());
    const html = renderOgrProductEmailCard(presentation, { href: HREF });
    const hrefMatches = html.match(new RegExp(`href="${HREF}"`, 'g')) ?? [];
    expect(hrefMatches.length).toBeGreaterThanOrEqual(3);
  });
});
