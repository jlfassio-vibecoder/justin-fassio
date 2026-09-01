import { escapeHtml } from '@/lib/escapeHtml';
import { isPublicAbsoluteImageUrl } from '@/lib/ogrPageMetadata';
import {
  OGR_PUBLIC_BRAND_NAME,
  type PublicProductPresentation,
} from '@/lib/publicProductPresentation';
import { formatMerchandiseSubtotalUsd } from '@/lib/wholesalePricing';

const DEFAULT_CTA_LABEL = 'View Details';
const CATALOG_CTA_LABEL = 'View Catalog';
// Copilot suggestion ignored: Phase 5 intentionally attributes justinfassio.com, not the href host.
const DOMAIN_ATTRIBUTION = 'justinfassio.com';
const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const CARD_MAX_WIDTH = 560;
const NAME_STYLE =
  'margin:0;font-size:20px;line-height:1.3;font-weight:700;color:#111111;font-family:' + FONT_STACK;

export type OgrProductEmailCardOptions = {
  /** Absolute http(s) product CTA URL. Required. Tracking/UTM belong upstream. */
  href: string;
  /** Absolute http(s) wholesale collection CTA URL. Required. */
  catalogHref: string;
  /**
   * Absolute http(s) image URL. If omitted, use presentation.primaryImageUrl when absolute.
   * Invalid / relative / non-http(s) → omit img (text-only card).
   */
  imageUrl?: string | null;
  /** Defaults to "View Details" (storefront card CTA). */
  ctaLabel?: string;
  /**
   * Staff-only wholesale USD for the name row. Not taken from PublicProductPresentation
   * (public surfaces must stay wholesale-free).
   */
  wholesaleUsd?: number | null;
  /**
   * Absolute http(s) PDF catalog URL. Shown under wholesale with cover when both
   * pdfCatalogHref and pdfCatalogCoverUrl are valid absolute http(s).
   */
  pdfCatalogHref?: string | null;
  /** Absolute http(s) cover image for the PDF catalog thumb. */
  pdfCatalogCoverUrl?: string | null;
};

function requireAbsoluteHttpUrl(url: string, label: string): string {
  const trimmed = url.trim();
  if (!trimmed || !isPublicAbsoluteImageUrl(trimmed)) {
    throw new Error(`${label} must be an absolute http(s) URL`);
  }
  return trimmed;
}

function resolveImage(
  presentation: PublicProductPresentation,
  imageUrl: string | null | undefined,
): { url: string; alt: string } | null {
  if (imageUrl !== undefined && imageUrl !== null) {
    const trimmed = imageUrl.trim();
    if (!isPublicAbsoluteImageUrl(trimmed)) return null;
    const name = presentation.name.trim();
    const alt = name ? `${OGR_PUBLIC_BRAND_NAME} ${name}` : OGR_PUBLIC_BRAND_NAME;
    return { url: trimmed, alt };
  }
  const primary = presentation.primaryImageUrl;
  if (!isPublicAbsoluteImageUrl(primary)) return null;
  return {
    url: (primary as string).trim(),
    alt: presentation.primaryImageAlt.trim() || OGR_PUBLIC_BRAND_NAME,
  };
}

function buildBadges(presentation: PublicProductPresentation): string[] {
  const badges: string[] = [];
  if (presentation.isBestSeller && presentation.salesVolumeRank != null) {
    badges.push(`#${presentation.salesVolumeRank} Best Seller`);
  }
  if (presentation.isNew) badges.push('New');
  if (presentation.isFeatured) badges.push('Featured');
  return badges;
}

function buildMetaLine(presentation: PublicProductPresentation): string {
  return [presentation.sku, presentation.category, presentation.color]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' · ');
}

function resolveWholesaleAmount(wholesaleUsd: number | null | undefined): string | null {
  if (wholesaleUsd == null || !Number.isFinite(wholesaleUsd) || wholesaleUsd <= 0) return null;
  return formatMerchandiseSubtotalUsd(wholesaleUsd);
}

/**
 * Pure featured OGR product email card HTML fragment.
 * Does not send email, fetch data, or build canonical URLs.
 *
 * Preview: `WRITE_EMAIL_PREVIEW=1 npm run email:preview-ogr-card`
 */
export function renderOgrProductEmailCard(
  presentation: PublicProductPresentation,
  options: OgrProductEmailCardOptions,
): string {
  const href = requireAbsoluteHttpUrl(options.href, 'href');
  const catalogHref = requireAbsoluteHttpUrl(options.catalogHref, 'catalogHref');
  const safeHref = escapeHtml(href);
  const safeCatalogHref = escapeHtml(catalogHref);
  const ctaLabel = (options.ctaLabel ?? DEFAULT_CTA_LABEL).trim() || DEFAULT_CTA_LABEL;
  const safeCta = escapeHtml(ctaLabel);
  const safeCatalogCta = escapeHtml(CATALOG_CTA_LABEL);
  const brand = escapeHtml(OGR_PUBLIC_BRAND_NAME);
  const name = escapeHtml(presentation.name.trim() || OGR_PUBLIC_BRAND_NAME);
  const meta = buildMetaLine(presentation);
  const tagline = presentation.tagline.trim();
  const badges = buildBadges(presentation);
  const image = resolveImage(presentation, options.imageUrl);
  const wholesaleAmount = resolveWholesaleAmount(options.wholesaleUsd);
  const pdfCatalogHrefRaw = options.pdfCatalogHref?.trim() || '';
  const pdfCatalogCoverRaw = options.pdfCatalogCoverUrl?.trim() || '';
  const pdfCatalogHref =
    pdfCatalogHrefRaw && isPublicAbsoluteImageUrl(pdfCatalogHrefRaw) ? pdfCatalogHrefRaw : null;
  const pdfCatalogCoverUrl =
    pdfCatalogCoverRaw && isPublicAbsoluteImageUrl(pdfCatalogCoverRaw) ? pdfCatalogCoverRaw : null;
  const showPdfCatalog = Boolean(wholesaleAmount && pdfCatalogHref && pdfCatalogCoverUrl);

  const imageBlock = image
    ? `<tr>
        <td style="padding:0;line-height:0;font-size:0;">
          <a href="${safeHref}" style="text-decoration:none;border:0;">
            <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt)}" width="${CARD_MAX_WIDTH}" style="display:block;width:100%;max-width:${CARD_MAX_WIDTH}px;height:auto;border:0;" />
          </a>
        </td>
      </tr>`
    : '';

  const badgeBlock =
    badges.length > 0
      ? `<p style="margin:0 0 8px 0;font-size:12px;line-height:1.4;color:#666666;font-family:${FONT_STACK};">
          ${badges.map((b) => escapeHtml(b)).join(' · ')}
        </p>`
      : '';

  const pdfCatalogBlock =
    showPdfCatalog && pdfCatalogHref && pdfCatalogCoverUrl
      ? `<a href="${escapeHtml(pdfCatalogHref)}" style="display:inline-block;margin:10px 0 0 0;text-decoration:none;border:0;text-align:right;white-space:normal;">
            <img src="${escapeHtml(pdfCatalogCoverUrl)}" alt="" width="80" style="display:block;width:80px;max-width:80px;height:auto;border:1px solid #e5e5e5;margin:0 0 4px auto;" />
            <span style="display:block;font-size:11px;line-height:1.2;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#666666;font-family:${FONT_STACK};">PDF catalog</span>
          </a>`
      : '';

  const nameBlock = wholesaleAmount
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 8px 0;border-collapse:collapse;">
        <tr>
          <td style="vertical-align:top;padding:0;${NAME_STYLE}">
            <a href="${safeHref}" style="color:#111111;text-decoration:none;">${name}</a>
          </td>
          <td style="vertical-align:top;padding:0 0 0 12px;text-align:right;">
            <p style="margin:0 0 2px 0;font-size:11px;line-height:1.2;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#666666;font-family:${FONT_STACK};white-space:nowrap;">Wholesale Price</p>
            <p style="margin:0;font-size:20px;line-height:1.3;font-weight:700;color:#111111;font-family:${FONT_STACK};white-space:nowrap;">${escapeHtml(wholesaleAmount)}</p>
            ${pdfCatalogBlock}
          </td>
        </tr>
      </table>`
    : `<p style="margin:0 0 8px 0;font-size:20px;line-height:1.3;font-weight:700;color:#111111;font-family:${FONT_STACK};">
        <a href="${safeHref}" style="color:#111111;text-decoration:none;">${name}</a>
      </p>`;

  const metaBlock = meta
    ? `<p style="margin:0 0 12px 0;font-size:13px;line-height:1.4;color:#666666;font-family:${FONT_STACK};">
        ${escapeHtml(meta)}
      </p>`
    : '';

  const taglineBlock = tagline
    ? `<p style="margin:0 0 16px 0;font-size:14px;line-height:1.5;color:#333333;font-family:${FONT_STACK};">
        ${escapeHtml(tagline)}
      </p>`
    : '';

  return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:${CARD_MAX_WIDTH}px;width:100%;border:1px solid #e5e5e5;background-color:#ffffff;border-collapse:collapse;">
  <tr>
    <td style="padding:18px 16px;background-color:#111111;text-align:center;border-bottom:3px solid #c4a35a;">
      <p style="margin:0;font-size:20px;line-height:1.2;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#ffffff;font-family:${FONT_STACK};">
        ${brand}
      </p>
      <p style="margin:6px 0 0 0;font-size:11px;line-height:1.3;letter-spacing:0.06em;text-transform:uppercase;color:#d9d9d9;font-family:${FONT_STACK};">
        Wholesale
      </p>
    </td>
  </tr>
  ${imageBlock}
  <tr>
    <td style="padding:20px 16px;font-family:${FONT_STACK};">
      ${badgeBlock}
      ${nameBlock}
      ${metaBlock}
      ${taglineBlock}
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="background-color:#111111;padding:12px 20px;">
            <a href="${safeHref}" style="display:inline-block;color:#ffffff;font-size:14px;line-height:1.2;font-weight:600;text-decoration:none;font-family:${FONT_STACK};">${safeCta}</a>
          </td>
          <td style="width:8px;font-size:0;line-height:0;">&nbsp;</td>
          <td style="border:1px solid #111111;padding:11px 19px;">
            <a href="${safeCatalogHref}" style="display:inline-block;color:#111111;font-size:14px;line-height:1.2;font-weight:600;text-decoration:none;font-family:${FONT_STACK};">${safeCatalogCta}</a>
          </td>
        </tr>
      </table>
      <p style="margin:12px 0 0 0;font-size:12px;line-height:1.4;color:#888888;font-family:${FONT_STACK};">
        ${escapeHtml(DOMAIN_ATTRIBUTION)}
      </p>
    </td>
  </tr>
</table>
`.trim();
}
