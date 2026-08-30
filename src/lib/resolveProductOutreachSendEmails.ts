import type { AccountContact } from '@/lib/accountContacts';
import { isValidOgrProductEmailRecipient } from '@/lib/ogrProductEmailLimits';

export type ProductOutreachSendContact = Pick<
  AccountContact,
  'isPrimary' | 'email' | 'alternateEmail'
>;

function normalizeSendEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Resolve Resend `to` addresses for a product outreach send.
 * Primary contacts with a distinct valid alternate get two addresses; otherwise one.
 * `fallbackTo` only reorders when it matches a contact email, or is used alone when
 * the contact has no usable email fields.
 */
export function resolveProductOutreachSendEmails(
  contact: ProductOutreachSendContact | null | undefined,
  fallbackTo: string,
): string[] {
  const fallback = fallbackTo.trim();
  const normalizedFallback =
    fallback && isValidOgrProductEmailRecipient(fallback) ? normalizeSendEmail(fallback) : '';

  if (!contact?.isPrimary) {
    return normalizedFallback ? [normalizedFallback] : [];
  }

  const ordered: string[] = [];
  const seen = new Set<string>();

  function push(raw: string | null | undefined) {
    const trimmed = (raw ?? '').trim();
    if (!trimmed || !isValidOgrProductEmailRecipient(trimmed)) return;
    const normalized = normalizeSendEmail(trimmed);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    ordered.push(normalized);
  }

  push(contact.email);
  push(contact.alternateEmail);

  if (ordered.length === 0) {
    return normalizedFallback ? [normalizedFallback] : [];
  }

  // Prefer intended `to` first when it matches a contact address (ordering only).
  if (normalizedFallback && ordered.includes(normalizedFallback)) {
    return [normalizedFallback, ...ordered.filter((e) => e !== normalizedFallback)];
  }

  return ordered;
}
