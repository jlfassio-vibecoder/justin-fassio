import { escapeHtml } from '@/lib/escapeHtml';
import { isPublicAbsoluteImageUrl } from '@/lib/ogrPageMetadata';
import { renderOgrProductEmailCard } from '@/lib/ogrProductEmailCard';
import {
  OGR_PUBLIC_BRAND_NAME,
  type PublicProductPresentation,
} from '@/lib/publicProductPresentation';

/** Default intro for staff compose UI + server fallback. */
export const OGR_PRODUCT_EMAIL_DEFAULT_INTRO =
  'I thought this Old Guys Rule style could be a strong fit for your store.';

/** Default closing for staff compose UI + server fallback. */
export const OGR_PRODUCT_EMAIL_DEFAULT_CLOSING =
  "Let me know if you'd like pricing or availability.";

const SITE_FOOTER = 'justinfassio.com';
const MUTED_FOOTER_STYLE = 'margin:16px 0 0 0;font-size:12px;line-height:1.4;color:#888888;';

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
<p>— ${escapeHtml(input.signatureName)}</p>
<p style="${MUTED_FOOTER_STYLE}">${escapeHtml(SITE_FOOTER)}</p>
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
}): string {
  const { presentation } = input;
  const lines: string[] = [
    input.greeting,
    '',
    input.intro,
    '',
    '─'.repeat(24),
    OGR_PUBLIC_BRAND_NAME.toUpperCase(),
    '─'.repeat(24),
    presentation.name,
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
    `— ${input.signatureName}`,
    SITE_FOOTER,
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

  const cardHtml = renderOgrProductEmailCard(presentation, { href: productHref, catalogHref });

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
    }),
  };
}
