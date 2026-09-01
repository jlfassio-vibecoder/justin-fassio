/**
 * Per-line public marketing assets (PDF catalogs / one-pagers + cover thumbs).
 * Files live under `public/marketing/{brand-slug}/` and are served at `/marketing/...`.
 *
 * Sent mail uses absolute https:// public-site URLs via resolvePublicSiteOrigin().
 * Composer preview rewrites cover/PDF to same-origin relative paths so sandboxed
 * srcDoc iframes can load them under CSP img-src 'self' (no huge data: URLs in srcDoc).
 *
 * After deploy, verify: curl -I https://justinfassio.com/marketing/old-guys-rule/cover.jpg → 200
 */

import { resolvePublicSiteOrigin, type ResolvePublicSiteOriginInput } from '@/lib/productUrls';

export type LineMarketingPdfCatalogPaths = {
  /** Site-relative path starting with `/`, e.g. `/marketing/old-guys-rule/OGR_2026_Catalog.pdf`. */
  pdfPath: string;
  /** Site-relative cover image path starting with `/`. */
  coverPath: string;
};

const OGR_PDF_CATALOG: LineMarketingPdfCatalogPaths = {
  pdfPath: '/marketing/old-guys-rule/OGR_2026_Catalog.pdf',
  // Small JPEG for email clients (WebP unsupported; large PNG bloated srcDoc previews).
  coverPath: '/marketing/old-guys-rule/cover.jpg',
};

/** Paths for the Old Guys Rule wholesale PDF catalog (email card thumb). */
export function getOgrPdfCatalogPaths(): LineMarketingPdfCatalogPaths {
  return OGR_PDF_CATALOG;
}

export function absoluteUrlForMarketingPath(origin: string, path: string): string {
  const base = origin.replace(/\/+$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

export type OgrPdfCatalogAbsoluteUrls = {
  pdfCatalogHref: string;
  pdfCatalogCoverUrl: string;
};

/**
 * Absolute PDF + cover URLs for the OGR email card.
 * Defaults to resolvePublicSiteOrigin() (PUBLIC_SITE_URL → justinfassio.com).
 * Do not pass window.location.origin for covers used in sent mail.
 */
export function resolveOgrPdfCatalogUrls(
  originInput: ResolvePublicSiteOriginInput | string = {},
): OgrPdfCatalogAbsoluteUrls {
  const origin = resolvePublicSiteOrigin(
    typeof originInput === 'string' ? { explicitOrigin: originInput } : originInput,
  );
  const paths = getOgrPdfCatalogPaths();
  return {
    pdfCatalogHref: absoluteUrlForMarketingPath(origin, paths.pdfPath),
    pdfCatalogCoverUrl: absoluteUrlForMarketingPath(origin, paths.coverPath),
  };
}

/**
 * Rewrite absolute marketing PDF/cover URLs to same-origin relative paths for the
 * composer preview iframe (srcDoc + allow-same-origin). Avoids data: injection that
 * can blank the entire srcDoc document when the cover is large.
 */
export function withOgrPdfCatalogPreviewRelativeUrls(cardHtml: string): string {
  if (!cardHtml.trim()) return cardHtml;
  const paths = getOgrPdfCatalogPaths();
  const publicUrls = resolveOgrPdfCatalogUrls();
  const localOrigin =
    typeof window !== 'undefined' ? window.location.origin.replace(/\/+$/, '') : null;
  const localCover = localOrigin ? absoluteUrlForMarketingPath(localOrigin, paths.coverPath) : null;
  const localPdf = localOrigin ? absoluteUrlForMarketingPath(localOrigin, paths.pdfPath) : null;

  let html = cardHtml;
  html = html.split(publicUrls.pdfCatalogCoverUrl).join(paths.coverPath);
  html = html.split(publicUrls.pdfCatalogHref).join(paths.pdfPath);
  if (localCover) html = html.split(localCover).join(paths.coverPath);
  if (localPdf) html = html.split(localPdf).join(paths.pdfPath);
  return html;
}
