import { describe, expect, it } from 'vitest';
import type { PublicOgrProduct } from '@/lib/publicCatalog';
import { renderOgrProductOutreachEmail } from '@/lib/ogrProductOutreachEmail';
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

function render(
  partial: Partial<PublicOgrProduct> = {},
  options: {
    productHref?: string;
    recipientName?: string | null;
    subject?: string | null;
    introText?: string | null;
    closingText?: string | null;
    signatureName?: string;
  } = {},
) {
  const presentation = buildPublicProductPresentation(fixture(partial), { salesVolumeRank: 3 });
  return renderOgrProductOutreachEmail({
    presentation,
    productHref: options.productHref ?? HREF,
    signatureName: options.signatureName ?? 'Alex Rivera',
    recipientName: options.recipientName,
    subject: options.subject,
    introText: options.introText,
    closingText: options.closingText,
  });
}

describe('renderOgrProductOutreachEmail', () => {
  it('uses default subject, intro, closing, and greeting without recipient name', () => {
    const result = render();
    expect(result.subject).toBe('Old Guys Rule — American Revival');
    expect(result.html).toContain('<p>Hi,</p>');
    expect(result.html).toContain('strong fit for your store');
    expect(result.html).toContain('pricing or availability');
    expect(result.html).toContain('— Alex Rivera');
    expect(result.html).toContain('justinfassio.com');
    expect(result.html).toContain('background-color:#111111');
    expect(result.html).toContain('Wholesale');
    expect(result.text).toContain('Hi,');
    expect(result.text).toContain('OLD GUYS RULE');
    expect(result.text).toContain('View Details:');
    expect(result.text).toContain(HREF);
  });

  it('accepts custom subject and greets by recipient name', () => {
    const result = render({}, { subject: 'A style for your shop', recipientName: 'Sarah' });
    expect(result.subject).toBe('A style for your shop');
    expect(result.html).toContain('<p>Hi Sarah,</p>');
    expect(result.text.startsWith('Hi Sarah,')).toBe(true);
  });

  it('embeds the Phase 5 product card with absolute href', () => {
    const result = render();
    expect(result.html).toContain('role="presentation"');
    expect(result.html).toContain('View Details');
    expect(result.html).toContain('American Revival');
    expect(result.html).toContain(`href="${HREF}"`);
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

  it('never leaks wholesale fields', () => {
    const result = render({ wholesaleUsd: 13 });
    const blob = `${result.subject}\n${result.html}\n${result.text}`;
    expect(blob).not.toContain('wholesaleUsd');
    expect(blob).not.toMatch(/US\$13/);
    for (const key of PUBLIC_PRESENTATION_FORBIDDEN_KEYS) {
      expect(blob).not.toContain(key);
    }
  });

  it('throws on invalid productHref or empty signatureName', () => {
    const presentation = buildPublicProductPresentation(fixture());
    expect(() =>
      renderOgrProductOutreachEmail({
        presentation,
        productHref: '/relative',
        signatureName: 'Justin',
      }),
    ).toThrow(/absolute http\(s\)/i);
    expect(() =>
      renderOgrProductOutreachEmail({
        presentation,
        productHref: HREF,
        signatureName: '   ',
      }),
    ).toThrow(/signatureName/i);
  });

  it('is deterministic for the same input', () => {
    const presentation = buildPublicProductPresentation(fixture(), { salesVolumeRank: 3 });
    const input = {
      presentation,
      productHref: HREF,
      recipientName: 'Sam',
      signatureName: 'Justin Fassio',
    };
    expect(renderOgrProductOutreachEmail(input)).toEqual(renderOgrProductOutreachEmail(input));
  });
});
