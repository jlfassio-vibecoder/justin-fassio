import { OGR_PUBLIC_BRAND_NAME } from '@/lib/publicProductPresentation';

export type CopyOgrProductEmailCardResult = 'rich' | 'plain';

/** Concise plain-text fallback for paste environments without rich HTML. */
export function buildOgrProductEmailCardPlainText(input: {
  productName: string;
  tagline?: string | null;
  productHref: string;
}): string {
  const name = input.productName.trim() || OGR_PUBLIC_BRAND_NAME;
  const tagline = (input.tagline ?? '').trim();
  const lines = [`${OGR_PUBLIC_BRAND_NAME} — ${name}`, ''];
  if (tagline) {
    lines.push(tagline, '');
  }
  lines.push('View Details:', input.productHref.trim());
  return lines.join('\n');
}

function canWriteRichClipboard(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.write === 'function' &&
    typeof ClipboardItem !== 'undefined'
  );
}

async function writePlainText(plainText: string): Promise<void> {
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
    throw new Error('Clipboard writeText is unavailable');
  }
  await navigator.clipboard.writeText(plainText);
}

/**
 * Copy Phase 5 card HTML + plain text. Prefer ClipboardItem; fall back to plain text only.
 * Never copies raw HTML as the plain-text body.
 */
export async function copyOgrProductEmailCardToClipboard(input: {
  html: string;
  plainText: string;
}): Promise<CopyOgrProductEmailCardResult> {
  const html = input.html;
  const plainText = input.plainText;

  if (canWriteRichClipboard()) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        }),
      ]);
      return 'rich';
    } catch {
      /* fall through to plain */
    }
  }

  try {
    await writePlainText(plainText);
    return 'plain';
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not copy email card';
    throw new Error(message, { cause: err });
  }
}
