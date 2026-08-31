import { describe, expect, it } from 'vitest';
import {
  absoluteUrlForMarketingPath,
  getOgrPdfCatalogPaths,
  resolveOgrPdfCatalogUrls,
  withOgrPdfCatalogPreviewRelativeUrls,
} from '@/lib/lineMarketingAssets';

describe('lineMarketingAssets', () => {
  it('maps OGR PDF and cover under /marketing/old-guys-rule as JPEG', () => {
    const paths = getOgrPdfCatalogPaths();
    expect(paths.pdfPath).toBe('/marketing/old-guys-rule/OGR_2026_Catalog.pdf');
    expect(paths.coverPath).toBe('/marketing/old-guys-rule/cover.jpg');
  });

  it('builds absolute URLs from origin + path', () => {
    expect(absoluteUrlForMarketingPath('https://justinfassio.com/', '/marketing/x.pdf')).toBe(
      'https://justinfassio.com/marketing/x.pdf',
    );
  });

  it('resolves OGR absolute PDF and cover from public site origin by default', () => {
    const urls = resolveOgrPdfCatalogUrls();
    expect(urls.pdfCatalogHref).toBe(
      'https://justinfassio.com/marketing/old-guys-rule/OGR_2026_Catalog.pdf',
    );
    expect(urls.pdfCatalogCoverUrl).toBe(
      'https://justinfassio.com/marketing/old-guys-rule/cover.jpg',
    );
    expect(urls.pdfCatalogCoverUrl).not.toContain('localhost');
  });

  it('resolves OGR absolute PDF and cover from explicit origin', () => {
    const urls = resolveOgrPdfCatalogUrls('https://example.test');
    expect(urls.pdfCatalogHref).toBe(
      'https://example.test/marketing/old-guys-rule/OGR_2026_Catalog.pdf',
    );
    expect(urls.pdfCatalogCoverUrl).toBe('https://example.test/marketing/old-guys-rule/cover.jpg');
  });

  it('rewrites public cover/PDF URLs to same-origin relative paths for preview', () => {
    const urls = resolveOgrPdfCatalogUrls();
    const html = `<a href="${urls.pdfCatalogHref}"><img src="${urls.pdfCatalogCoverUrl}" alt="" /></a>`;
    const preview = withOgrPdfCatalogPreviewRelativeUrls(html);
    expect(preview).toContain('href="/marketing/old-guys-rule/OGR_2026_Catalog.pdf"');
    expect(preview).toContain('src="/marketing/old-guys-rule/cover.jpg"');
    expect(preview).not.toContain('https://justinfassio.com/marketing/');
  });
});
