import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildOgrProductEmailCardPlainText,
  copyOgrProductEmailCardToClipboard,
} from '@/lib/copyOgrProductEmailCard';
import type { PublicOgrProduct } from '@/lib/publicCatalog';
import { renderOgrProductEmailCard } from '@/lib/ogrProductEmailCard';
import { buildPublicProductPresentation } from '@/lib/publicProductPresentation';

const HREF = 'https://justinfassio.com/old-guys-rule-wholesale/american-revival-og2513';
const PLAIN = buildOgrProductEmailCardPlainText({
  productName: 'American Revival',
  tagline: 'Great American Revival',
  productHref: HREF,
});

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('buildOgrProductEmailCardPlainText', () => {
  it('includes brand, name, tagline, and URL', () => {
    expect(PLAIN).toBe(
      [
        'Old Guys Rule — American Revival',
        '',
        'Great American Revival',
        '',
        'View Details:',
        HREF,
      ].join('\n'),
    );
  });

  it('omits tagline block when empty', () => {
    expect(
      buildOgrProductEmailCardPlainText({
        productName: 'American Revival',
        tagline: '  ',
        productHref: HREF,
      }),
    ).toBe(['Old Guys Rule — American Revival', '', 'View Details:', HREF].join('\n'));
  });
});

describe('copyOgrProductEmailCardToClipboard', () => {
  it('writes rich html and plain when ClipboardItem is available', async () => {
    const presentation = buildPublicProductPresentation(fixture());
    const html = renderOgrProductEmailCard(presentation, { href: HREF });
    expect(html).toContain(HREF);
    expect(html).not.toContain('wholesaleUsd');

    const write = vi.fn().mockResolvedValue(undefined);
    class MockClipboardItem {
      constructor(public items: Record<string, Blob>) {}
    }
    vi.stubGlobal('ClipboardItem', MockClipboardItem);
    vi.stubGlobal('navigator', {
      clipboard: { write, writeText: vi.fn() },
    });

    await expect(copyOgrProductEmailCardToClipboard({ html, plainText: PLAIN })).resolves.toBe(
      'rich',
    );
    expect(write).toHaveBeenCalledTimes(1);
    const item = write.mock.calls[0][0][0] as MockClipboardItem;
    expect(item.items['text/html']).toBeInstanceOf(Blob);
    expect(item.items['text/plain']).toBeInstanceOf(Blob);
    expect(await item.items['text/html'].text()).toBe(html);
    expect(await item.items['text/plain'].text()).toBe(PLAIN);
  });

  it('falls back to writeText(plainText) when rich write throws', async () => {
    const html = '<table>card</table>';
    const write = vi.fn().mockRejectedValue(new Error('rich blocked'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    class MockClipboardItem {
      constructor(public items: Record<string, Blob>) {}
    }
    vi.stubGlobal('ClipboardItem', MockClipboardItem);
    vi.stubGlobal('navigator', { clipboard: { write, writeText } });

    await expect(copyOgrProductEmailCardToClipboard({ html, plainText: PLAIN })).resolves.toBe(
      'plain',
    );
    expect(writeText).toHaveBeenCalledWith(PLAIN);
    expect(writeText.mock.calls[0][0]).not.toContain('<table>');
  });

  it('uses plain path when ClipboardItem is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('ClipboardItem', undefined);
    vi.stubGlobal('navigator', {
      clipboard: { write: vi.fn(), writeText },
    });

    await expect(
      copyOgrProductEmailCardToClipboard({ html: '<table>x</table>', plainText: PLAIN }),
    ).resolves.toBe('plain');
    expect(writeText).toHaveBeenCalledWith(PLAIN);
  });

  it('rejects when both rich and plain paths fail', async () => {
    vi.stubGlobal('ClipboardItem', undefined);
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    });

    await expect(
      copyOgrProductEmailCardToClipboard({ html: '<table>x</table>', plainText: PLAIN }),
    ).rejects.toThrow(/denied|unavailable|copy/i);
  });
});
