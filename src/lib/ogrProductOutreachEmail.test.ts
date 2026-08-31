import { describe, expect, it } from 'vitest';
import type { PublicOgrProduct } from '@/lib/publicCatalog';
import { renderOgrProductOutreachEmail } from '@/lib/ogrProductOutreachEmail';
import {
  buildPublicProductPresentation,
  PUBLIC_PRESENTATION_FORBIDDEN_KEYS,
} from '@/lib/publicProductPresentation';

const HREF = 'https://justinfassio.com/old-guys-rule-wholesale/american-revival-og2513';
const CATALOG_HREF = 'https://justinfassio.com/old-guys-rule-wholesale';

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

function render(
  partial: Partial<PublicOgrProduct> = {},
  options: {
    productHref?: string;
    catalogHref?: string;
    recipientName?: string | null;
    subject?: string | null;
    introText?: string | null;
    closingText?: string | null;
    signatureName?: string;
    wholesaleUsd?: number | null;
  } = {},
) {
  const presentation = buildPublicProductPresentation(fixture(partial), { salesVolumeRank: 3 });
  return renderOgrProductOutreachEmail({
    presentation,
    productHref: options.productHref ?? HREF,
    catalogHref: options.catalogHref ?? CATALOG_HREF,
    signatureName: options.signatureName ?? 'Alex Rivera',
    recipientName: options.recipientName,
    subject: options.subject,
    introText: options.introText,
    closingText: options.closingText,
    wholesaleUsd: options.wholesaleUsd,
  });
}

describe('renderOgrProductOutreachEmail', () => {
  it('uses default subject, intro, closing, and greeting without recipient name', () => {
    const result = render();
    expect(result.subject).toBe('Old Guys Rule — American Revival');
    expect(result.html).toContain('<p>Hi,</p>');
    expect(result.html).toContain('Check out this style from our Old Guys Rule catalog');
    expect(result.html).toContain('sell well as gifts');
    expect(result.html).toContain('— Alex Rivera');
    expect(result.html).toContain('Independent Rep: Old Guys Rule');
    expect(result.html).toContain('mailto:office@justinfassio.com');
    expect(result.html).toContain('office@justinfassio.com');
    expect(result.html).toContain('Text me at');
    expect(result.html).toContain('tel:8582858986');
    expect(result.html).toContain('858-285-8986');
    expect(result.html).toContain('justinfassio.com');
    expect(result.html).toContain('background-color:#111111');
    expect(result.html).toContain('Wholesale');
    expect(result.text).toContain('Hi,');
    expect(result.text).toContain('OLD GUYS RULE');
    expect(result.text).toContain('Independent Rep: Old Guys Rule');
    expect(result.text).toContain('office@justinfassio.com');
    expect(result.text).toContain('Text me at 858-285-8986');
    expect(result.text).toContain('View Details:');
    expect(result.text).toContain(HREF);
    expect(result.text).toContain('View Catalog:');
    expect(result.text).toContain(CATALOG_HREF);
  });

  it('accepts custom subject and greets by recipient name', () => {
    const result = render({}, { subject: 'A style for your shop', recipientName: 'Sarah' });
    expect(result.subject).toBe('A style for your shop');
    expect(result.html).toContain('<p>Hi Sarah,</p>');
    expect(result.text.startsWith('Hi Sarah,')).toBe(true);
  });

  it('embeds the Phase 5 product card with absolute product and catalog hrefs', () => {
    const result = render();
    expect(result.html).toContain('role="presentation"');
    expect(result.html).toContain('View Details');
    expect(result.html).toContain('View Catalog');
    expect(result.html).toContain('American Revival');
    expect(result.html).toContain(`href="${HREF}"`);
    expect(result.html).toContain(`href="${CATALOG_HREF}"`);
    expect(result.html).toContain('#3 Best Seller');
  });

  it('uses custom intro and closing, including escaped newlines as br', () => {
    const result = render(
      {},
      {
        introText: 'Line one\nLine two',
        closingText: 'Thanks again',
      },
    );
    expect(result.html).toContain('Line one<br>Line two');
    expect(result.html).toContain('Thanks again');
    expect(result.text).toContain('Line one\nLine two');
    expect(result.text).toContain('Thanks again');
  });

  it('escapes special characters in staff prose and recipient name', () => {
    const result = render(
      {},
      {
        recipientName: `Sam <script>`,
        introText: `A & B <C> "D" 'E'`,
        closingText: `Bye <img>`,
        signatureName: `Justin & Co`,
      },
    );
    expect(result.html).toContain('Hi Sam &lt;script&gt;,');
    expect(result.html).toContain('A &amp; B &lt;C&gt; &quot;D&quot; &#39;E&#39;');
    expect(result.html).toContain('Bye &lt;img&gt;');
    expect(result.html).toContain('— Justin &amp; Co');
    expect(result.html).not.toContain('<script>');
  });

  it('omits img when primary image is missing and still returns text', () => {
    const result = render({ primaryImageUrl: null });
    expect(result.html).not.toContain('<img');
    expect(result.text).toContain('American Revival');
    expect(result.text).toContain('View Details:');
  });

  it('never leaks wholesale fields from the presentation alone', () => {
    const result = render({ wholesaleUsd: 13 });
    const blob = `${result.subject}\n${result.html}\n${result.text}`;
    expect(blob).not.toContain('wholesaleUsd');
    expect(blob).not.toMatch(/US\$13/);
    for (const key of PUBLIC_PRESENTATION_FORBIDDEN_KEYS) {
      expect(blob).not.toContain(key);
    }
  });

  it('includes staff wholesale on the card and text when wholesaleUsd is provided', () => {
    const result = render({}, { wholesaleUsd: 13 });
    expect(result.html).toContain('Wholesale Price');
    expect(result.html).toContain('US$13.00');
    expect(result.text).toContain('American Revival — Wholesale Price US$13.00');
    expect(result.html).not.toContain('wholesaleUsd');
  });

  it('throws on invalid productHref/catalogHref or empty signatureName', () => {
    const presentation = buildPublicProductPresentation(fixture());
    expect(() =>
      renderOgrProductOutreachEmail({
        presentation,
        productHref: '/relative',
        catalogHref: CATALOG_HREF,
        signatureName: 'Justin',
      }),
    ).toThrow(/absolute http\(s\)/i);
    expect(() =>
      renderOgrProductOutreachEmail({
        presentation,
        productHref: HREF,
        catalogHref: '/relative',
        signatureName: 'Justin',
      }),
    ).toThrow(/absolute http\(s\)/i);
    expect(() =>
      renderOgrProductOutreachEmail({
        presentation,
        productHref: HREF,
        catalogHref: CATALOG_HREF,
        signatureName: '   ',
      }),
    ).toThrow(/signatureName/i);
  });

  it('is deterministic for the same input', () => {
    const presentation = buildPublicProductPresentation(fixture(), { salesVolumeRank: 3 });
    const input = {
      presentation,
      productHref: HREF,
      catalogHref: CATALOG_HREF,
      recipientName: 'Sam',
      signatureName: 'Justin Fassio',
    };
    expect(renderOgrProductOutreachEmail(input)).toEqual(renderOgrProductOutreachEmail(input));
  });
});
