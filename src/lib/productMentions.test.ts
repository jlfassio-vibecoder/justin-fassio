import { describe, expect, it } from 'vitest';
import {
  applyMentionReplacement,
  filterProductMentions,
  formatProductMention,
  parseMentionTrigger,
} from '@/lib/productMentions';
import type { CatalogItem } from '@/lib/catalog';

const ITEMS: CatalogItem[] = [
  {
    page: 1,
    cat: 'Tees',
    sku: 'OG2511',
    name: 'Old Guys Rule Classic Tee',
    color: 'Navy',
    tagline: '',
    priceUsd: 12.5,
    msrpCad: 42,
    isNew: false,
    isNameDrop: true,
  },
  {
    page: 2,
    cat: 'Tees',
    sku: 'OG2599',
    name: 'Harbor Graphic Tee',
    color: 'White',
    tagline: '',
    priceUsd: 14,
    msrpCad: 48,
    isNew: true,
    isNameDrop: false,
  },
];

describe('parseMentionTrigger', () => {
  it('detects bare # at start', () => {
    expect(parseMentionTrigger('#', 1)).toEqual({ start: 0, query: '' });
  });

  it('detects #query after whitespace', () => {
    const value = 'Note #OG25';
    expect(parseMentionTrigger(value, value.length)).toEqual({ start: 5, query: 'OG25' });
  });

  it('returns null for mid-word #', () => {
    expect(parseMentionTrigger('foo#bar', 7)).toBeNull();
  });

  it('returns null once a space ends the query', () => {
    const value = 'Note #OG25 done';
    expect(parseMentionTrigger(value, value.length)).toBeNull();
  });

  it('uses caret, not end of string', () => {
    const value = '#Classic more';
    expect(parseMentionTrigger(value, 8)).toEqual({ start: 0, query: 'Classic' });
    expect(parseMentionTrigger(value, value.length)).toBeNull();
  });
});

describe('filterProductMentions', () => {
  it('matches sku and name case-insensitively', () => {
    expect(filterProductMentions(ITEMS, 'og25').map((i) => i.sku)).toEqual(['OG2511', 'OG2599']);
    expect(filterProductMentions(ITEMS, 'classic').map((i) => i.sku)).toEqual(['OG2511']);
  });

  it('returns first N when query empty', () => {
    expect(filterProductMentions(ITEMS, '', 1)).toHaveLength(1);
  });
});

describe('formatProductMention + applyMentionReplacement', () => {
  it('formats name and sku', () => {
    expect(formatProductMention(ITEMS[0]!)).toBe('Old Guys Rule Classic Tee (SKU: OG2511)');
  });

  it('replaces #query and advances caret after trailing space', () => {
    const value = 'Need #OG25';
    const trigger = parseMentionTrigger(value, value.length)!;
    const insertion = formatProductMention(ITEMS[0]!);
    const result = applyMentionReplacement(value, trigger.start, value.length, insertion);
    expect(result.value).toBe('Need Old Guys Rule Classic Tee (SKU: OG2511) ');
    expect(result.caret).toBe(result.value.length);
  });
});
