import { describe, expect, it } from 'vitest';
import {
  extractShopifyEvidenceFromHtml,
  extractSocialLinksFromHtml,
} from '@/lib/accountResearch/officialWebsiteSocialLinks';

describe('extractSocialLinksFromHtml', () => {
  it('finds social links from anchor hrefs', () => {
    const html = `
      <footer>
        <a href="https://www.instagram.com/trailoutfitters/">Instagram</a>
        <a href="https://facebook.com/trailoutfitters">Facebook</a>
      </footer>
    `;
    const links = extractSocialLinksFromHtml(html);
    expect(links.instagram?.handle).toBe('trailoutfitters');
    expect(links.instagram?.source).toBe('html_anchor');
    expect(links.facebook?.handle).toBe('trailoutfitters');
  });

  it('prefers JSON-LD sameAs over anchor links and tags the source', () => {
    const html = `
      <script type="application/ld+json">
        {"@type":"Organization","name":"Trail Outfitters","sameAs":["https://www.instagram.com/trailoutfitters/"]}
      </script>
      <a href="https://www.instagram.com/trailoutfitters/">Instagram</a>
    `;
    const links = extractSocialLinksFromHtml(html);
    expect(links.instagram?.source).toBe('json_ld_sameAs');
  });

  it('returns no links when the site has none', () => {
    const html = '<html><body><p>No social links here.</p></body></html>';
    expect(extractSocialLinksFromHtml(html)).toEqual({});
  });
});

describe('extractShopifyEvidenceFromHtml', () => {
  it('detects a myshopify.com link', () => {
    const html = '<a href="https://trail-outfitters.myshopify.com/collections/all">Shop</a>';
    expect(extractShopifyEvidenceFromHtml(html)).toEqual({
      found: true,
      evidenceUrl: 'https://trail-outfitters.myshopify.com/collections/all',
    });
  });

  it('detects a cdn.shopify.com asset link', () => {
    const html = '<link href="https://cdn.shopify.com/s/files/1/0001/theme.css">';
    expect(extractShopifyEvidenceFromHtml(html).found).toBe(true);
  });

  it('detects a "Powered by Shopify" footer credit with no evidence URL', () => {
    const html = '<footer>Powered by Shopify</footer>';
    expect(extractShopifyEvidenceFromHtml(html)).toEqual({ found: true, evidenceUrl: null });
  });

  it('reports no evidence for a non-Shopify site', () => {
    const html = '<footer>Copyright 2026 Trail Outfitters</footer>';
    expect(extractShopifyEvidenceFromHtml(html)).toEqual({ found: false, evidenceUrl: null });
  });
});
