import type { CatalogItem } from '@/lib/catalog';
import { accountContactRoleLabel, type AccountContact } from '@/lib/accountContacts';

export type MentionKind = 'product' | 'contact';

export interface ActiveMention {
  kind: MentionKind;
  /** Index of the `#` or `@` that starts the active mention. */
  start: number;
  /** Text after the trigger up to the caret (no spaces). */
  query: string;
}

/**
 * Detect an active `#query` or `@query` token ending at `caretIndex`.
 * Uses the nearest trigger before the caret that is at start-of-string or after whitespace.
 */
export function parseActiveMention(value: string, caretIndex: number): ActiveMention | null {
  if (caretIndex < 0 || caretIndex > value.length) return null;

  const before = value.slice(0, caretIndex);
  const hashIndex = before.lastIndexOf('#');
  const atIndex = before.lastIndexOf('@');
  const start = Math.max(hashIndex, atIndex);
  if (start < 0) return null;

  if (start > 0) {
    const prev = before[start - 1];
    if (prev && !/\s/.test(prev)) return null;
  }

  const query = before.slice(start + 1);
  if (/\s/.test(query)) return null;

  const kind: MentionKind = before[start] === '@' ? 'contact' : 'product';
  return { kind, start, query };
}

/** @deprecated Prefer parseActiveMention — kept for product-only call sites. */
export function parseMentionTrigger(
  value: string,
  caretIndex: number,
): { start: number; query: string } | null {
  const active = parseActiveMention(value, caretIndex);
  if (!active || active.kind !== 'product') return null;
  return { start: active.start, query: active.query };
}

const DEFAULT_LIMIT = 8;

/** Case-insensitive substring match on sku + name; capped results. */
export function filterProductMentions(
  items: CatalogItem[],
  query: string,
  limit = DEFAULT_LIMIT,
): CatalogItem[] {
  const q = query.trim().toLowerCase();
  const out: CatalogItem[] = [];
  for (const item of items) {
    if (q) {
      const hay = `${item.sku} ${item.name}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/** Match full name or role label (e.g. buyer). */
export function filterContactMentions(
  contacts: AccountContact[],
  query: string,
  limit = DEFAULT_LIMIT,
): AccountContact[] {
  const q = query.trim().toLowerCase();
  const out: AccountContact[] = [];
  for (const contact of contacts) {
    if (q) {
      const hay = `${contact.fullName} ${accountContactRoleLabel(contact.role)}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    out.push(contact);
    if (out.length >= limit) break;
  }
  return out;
}

export function formatProductMention(item: Pick<CatalogItem, 'sku' | 'name'>): string {
  return `${item.name} (SKU: ${item.sku})`;
}

export function formatContactMention(contact: Pick<AccountContact, 'fullName' | 'role'>): string {
  return `${contact.fullName} [${accountContactRoleLabel(contact.role)}]`;
}

/**
 * Replace trigger+query (from `start` through `caretIndex`) with `insertion` + trailing space.
 */
export function applyMentionReplacement(
  value: string,
  start: number,
  caretIndex: number,
  insertion: string,
): { value: string; caret: number } {
  const withSpace = insertion.endsWith(' ') ? insertion : `${insertion} `;
  const next = value.slice(0, start) + withSpace + value.slice(caretIndex);
  return { value: next, caret: start + withSpace.length };
}
