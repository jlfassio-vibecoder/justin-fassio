import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { PublicOgrProduct } from '@/lib/publicCatalog';
import { renderOgrProductEmailCard } from '@/lib/ogrProductEmailCard';
import { buildPublicProductPresentation } from '@/lib/publicProductPresentation';

const HREF = 'https://justinfassio.com/old-guys-rule-wholesale/american-revival-og2513';

function fixture(): PublicOgrProduct {
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
  };
}

describe('ogrProductEmailCard preview', () => {
  it('renders a browser-openable preview when WRITE_EMAIL_PREVIEW=1', () => {
    const presentation = buildPublicProductPresentation(fixture(), { salesVolumeRank: 3 });
    const card = renderOgrProductEmailCard(presentation, { href: HREF });
    expect(card).toContain('American Revival');

    if (process.env.WRITE_EMAIL_PREVIEW !== '1') return;

    const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
    const outPath = join(root, 'tmp', 'ogr-product-email-card-preview.html');
    mkdirSync(dirname(outPath), { recursive: true });
    const document = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OGR product email card preview</title>
</head>
<body style="margin:0;padding:24px;background:#f3f3f3;">
${card}
</body>
</html>
`;
    writeFileSync(outPath, document, 'utf8');
  });
});
