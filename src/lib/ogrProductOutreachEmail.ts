import { CONTACT_EMAIL } from '@/data/landing';
import { escapeHtml } from '@/lib/escapeHtml';
import { isPublicAbsoluteImageUrl } from '@/lib/ogrPageMetadata';
import { renderOgrProductEmailCard } from '@/lib/ogrProductEmailCard';
import {
  OGR_PUBLIC_BRAND_NAME,
  type PublicProductPresentation,
} from '@/lib/publicProductPresentation';
import { formatMerchandiseSubtotalUsd } from '@/lib/wholesalePricing';

/** Default intro for staff compose UI + server fallback. */
export const OGR_PRODUCT_EMAIL_DEFAULT_INTRO =
  'Check out this style from our Old Guys Rule catalog. It blends humor with lifestyle in a way that lands well with coastal and outdoor shops.';

/** Default closing for staff compose UI + server fallback. */
export const OGR_PRODUCT_EMAIL_DEFAULT_CLOSING =
  'We find styles like this sell well as gifts or to customers who connect with that vibe. We have many more that can fit your store as well.';

const SITE_FOOTER = 'justinfassio.com';
const SITE_FOOTER_HREF = 'https://justinfassio.com';
const SIGNATURE_TITLE = 'Independent Rep: Old Guys Rule';
const SIGNATURE_EMAIL = CONTACT_EMAIL;
const SIGNATURE_PHONE_DISPLAY = '858-285-8986';
const SIGNATURE_PHONE_TEL = '8582858986';
const MUTED_STYLE = 'margin:4px 0 0 0;font-size:14px;line-height:1.4;color:#555555;';
const CONTACT_STYLE = 'margin:12px 0 0 0;font-size:14px;line-height:1.5;color:#111111;';
const SITE_STYLE = 'margin:4px 0 0 0;font-size:12px;line-height:1.4;color:#888888;';

/** Default subject line for staff compose UI + server fallback. */
export function defaultOgrProductEmailSubject(productName: string): string {
  const name = productName.trim() || OGR_PUBLIC_BRAND_NAME;
  return `Old Guys Rule — ${name}`;
}

export type OgrProductOutreachEmailInput = {
  presentation: PublicProductPresentation;
  /** Absolute http(s) product URL — same validation as card href. */
  productHref: string;
  /** Absolute http(s) wholesale collection URL — same validation as card catalogHref. */
  catalogHref: string;
  recipientName?: string | null;
  subject?: string | null;
  /** Defaults when omitted/blank. */
  introText?: string | null;
  closingText?: string | null;
  /** Visible signature name (caller: first name from staff profile display_name). */
  signatureName: string;
  /** Staff-only wholesale USD for the embedded product card name row. */
  wholesaleUsd?: number | null;
};

export type OgrProductOutreachEmail = {
  subject: string;
  html: string;
  text: string;
};

function requireAbsoluteHttpUrl(url: string, label: string): string {
  const trimmed = url.trim();
  if (!trimmed || !isPublicAbsoluteImageUrl(trimmed)) {
    throw new Error(`${label} must be an absolute http(s) URL`);
  }
  return trimmed;
}

function resolveProse(value: string | null | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim();
  return trimmed || fallback;
}

function buildGreeting(recipientName: string | null | undefined): string {
  const name = (recipientName ?? '').trim();
  return name ? `Hi ${name},` : 'Hi,';
}

function buildMetaLine(presentation: PublicProductPresentation): string {
  return [presentation.sku, presentation.category, presentation.color]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' · ');
}

/** Escape plain text, then turn newlines into `<br>` for email HTML. */
function proseToHtml(value: string): string {
  return escapeHtml(value).replaceAll('\n', '<br>');
}

function resolveWholesaleAmount(wholesaleUsd: number | null | undefined): string | null {
  if (wholesaleUsd == null || !Number.isFinite(wholesaleUsd) || wholesaleUsd <= 0) return null;
  return formatMerchandiseSubtotalUsd(wholesaleUsd);
}

function buildSignatureHtml(signatureName: string): string {
  const safeEmail = escapeHtml(SIGNATURE_EMAIL);
  const safePhone = escapeHtml(SIGNATURE_PHONE_DISPLAY);
  return `
<p style="margin:0;">— ${escapeHtml(signatureName)}</p>
<p style="${MUTED_STYLE}">${escapeHtml(SIGNATURE_TITLE)}</p>
<p style="${CONTACT_STYLE}"><a href="mailto:${safeEmail}" style="color:#111111;text-decoration:underline;">${safeEmail}</a></p>
<p style="margin:4px 0 0 0;font-size:14px;line-height:1.5;color:#111111;">Text me at <a href="tel:${SIGNATURE_PHONE_TEL}" style="color:#111111;text-decoration:underline;">${safePhone}</a></p>
<p style="${SITE_STYLE}"><a href="${SITE_FOOTER_HREF}" style="color:#888888;text-decoration:underline;">${escapeHtml(SITE_FOOTER)}</a></p>
`.trim();
}

function buildSignatureText(signatureName: string): string[] {
  return [
    `— ${signatureName}`,
    SIGNATURE_TITLE,
    '',
    SIGNATURE_EMAIL,
    `Text me at ${SIGNATURE_PHONE_DISPLAY}`,
    SITE_FOOTER,
  ];
}

function buildHtml(input: {
  greeting: string;
  intro: string;
  closing: string;
  signatureName: string;
  cardHtml: string;
}): string {
  return `
<p>${escapeHtml(input.greeting)}</p>
<p>${proseToHtml(input.intro)}</p>
${input.cardHtml}
<p>${proseToHtml(input.closing)}</p>
${buildSignatureHtml(input.signatureName)}
`.trim();
}

function buildText(input: {
  greeting: string;
  intro: string;
  closing: string;
  signatureName: string;
  presentation: PublicProductPresentation;
  productHref: string;
  catalogHref: string;
  wholesaleAmount: string | null;
}): string {
  const { presentation } = input;
  const nameLine = input.wholesaleAmount
    ? `${presentation.name} — Wholesale Price ${input.wholesaleAmount}`
    : presentation.name;
  const lines: string[] = [
    input.greeting,
    '',
    input.intro,
    '',
    '─'.repeat(24),
    OGR_PUBLIC_BRAND_NAME.toUpperCase(),
    '─'.repeat(24),
    nameLine,
  ];
  const meta = buildMetaLine(presentation);
  if (meta) lines.push(meta);
  const tagline = presentation.tagline.trim();
  if (tagline) lines.push(tagline);
  lines.push(
    '',
    'View Details:',
    input.productHref,
    'View Catalog:',
    input.catalogHref,
    '',
    input.closing,
    '',
    ...buildSignatureText(input.signatureName),
  );
  return lines.join('\n');
}

/**
 * Pure staff outreach email: subject + HTML body + plain text.
 * Embeds Phase 5 product card; does not send, fetch, or read env.
 */
export function renderOgrProductOutreachEmail(
  input: OgrProductOutreachEmailInput,
): OgrProductOutreachEmail {
  const productHref = requireAbsoluteHttpUrl(input.productHref, 'productHref');
  const catalogHref = requireAbsoluteHttpUrl(input.catalogHref, 'catalogHref');
  const signatureName = input.signatureName.trim();
  if (!signatureName) {
    throw new Error('signatureName is required');
  }

  const { presentation } = input;
  const productName = presentation.name.trim() || OGR_PUBLIC_BRAND_NAME;
  const subject = resolveProse(input.subject, defaultOgrProductEmailSubject(productName));
  const intro = resolveProse(input.introText, OGR_PRODUCT_EMAIL_DEFAULT_INTRO);
  const closing = resolveProse(input.closingText, OGR_PRODUCT_EMAIL_DEFAULT_CLOSING);
  const greeting = buildGreeting(input.recipientName);
  const wholesaleAmount = resolveWholesaleAmount(input.wholesaleUsd);

  const cardHtml = renderOgrProductEmailCard(presentation, {
    href: productHref,
    catalogHref,
    wholesaleUsd: input.wholesaleUsd,
  });

  return {
    subject,
    html: buildHtml({ greeting, intro, closing, signatureName, cardHtml }),
    text: buildText({
      greeting,
      intro,
      closing,
      signatureName,
      presentation,
      productHref,
      catalogHref,
      wholesaleAmount,
    }),
  };
}
