import type { CatalogItem } from '@/lib/catalog';

export interface MentionTrigger {
  /** Index of the `#` that starts the active mention. */
  start: number;
  /** Text after `#` up to the caret (no spaces). */
  query: string;
}

/**
 * Detect an active `#query` token ending at `caretIndex`.
 * Trigger is only valid when `#` is at start-of-string or after whitespace.
 */
export function parseMentionTrigger(value: string, caretIndex: number): MentionTrigger | null {
  if (caretIndex < 0 || caretIndex > value.length) return null;

  const before = value.slice(0, caretIndex);
  const hashIndex = before.lastIndexOf('#');
  if (hashIndex < 0) return null;

  if (hashIndex > 0) {
    const prev = before[hashIndex - 1];
    if (prev && !/\s/.test(prev)) return null;
  }

  const query = before.slice(hashIndex + 1);
  if (/\s/.test(query)) return null;

  return { start: hashIndex, query };
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

export function formatProductMention(item: Pick<CatalogItem, 'sku' | 'name'>): string {
  return `${item.name} (SKU: ${item.sku})`;
}

/**
 * Replace `#query` (from `start` through `caretIndex`) with `insertion` + trailing space.
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
