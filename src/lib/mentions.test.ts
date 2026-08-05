import { describe, expect, it } from 'vitest';
import { catalogItemStub } from '@/lib/catalog';
import type { AccountContact } from '@/lib/accountContacts';
import {
  applyMentionReplacement,
  filterContactMentions,
  filterProductMentions,
  formatContactMention,
  formatProductMention,
  parseActiveMention,
} from '@/lib/mentions';

const ITEMS = [
  catalogItemStub({
    page: 1,
    cat: 'Tees',
    sku: 'OG2511',
    name: 'Old Guys Rule Classic Tee',
    color: 'Navy',
    priceUsd: 12.5,
    msrpCad: 42,
    isNameDrop: true,
  }),
  catalogItemStub({
    page: 2,
    cat: 'Tees',
    sku: 'OG2599',
    name: 'Harbor Graphic Tee',
    color: 'White',
    priceUsd: 14,
    msrpCad: 48,
    isNew: true,
  }),
];

const CONTACTS: AccountContact[] = [
  {
    id: 'c1',
    accountId: 1,
    role: 'buyer',
    fullName: 'Sarah Jenkins',
    title: null,
    phone: null,
    email: null,
    isPrimary: true,
    notes: null,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  },
  {
    id: 'c2',
    accountId: 1,
    role: 'owner',
    fullName: 'John Miller',
    title: 'Owner',
    phone: null,
    email: null,
    isPrimary: false,
    notes: null,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  },
];

describe('parseActiveMention', () => {
  it('detects bare # and @ at start', () => {
    expect(parseActiveMention('#', 1)).toEqual({ kind: 'product', start: 0, query: '' });
    expect(parseActiveMention('@', 1)).toEqual({ kind: 'contact', start: 0, query: '' });
  });

  it('detects # and @ after whitespace', () => {
    expect(parseActiveMention('Note #OG25', 10)).toEqual({
      kind: 'product',
      start: 5,
      query: 'OG25',
    });
    expect(parseActiveMention('Call @Sar', 9)).toEqual({
      kind: 'contact',
      start: 5,
      query: 'Sar',
    });
  });

  it('returns null for mid-word triggers', () => {
    expect(parseActiveMention('foo#bar', 7)).toBeNull();
    expect(parseActiveMention('foo@bar', 7)).toBeNull();
  });

  it('picks the nearest trigger before caret when both exist', () => {
    const value = 'See #OG25 and @Sarah';
    expect(parseActiveMention(value, value.length)).toEqual({
      kind: 'contact',
      start: 14,
      query: 'Sarah',
    });
    // Caret right after "#OG25" (index 9) — still inside the product mention.
    expect(parseActiveMention(value, 9)).toEqual({
      kind: 'product',
      start: 4,
      query: 'OG25',
    });
  });
});

describe('filter + format', () => {
  it('filters products and contacts', () => {
    expect(filterProductMentions(ITEMS, 'classic').map((i) => i.sku)).toEqual(['OG2511']);
    expect(filterContactMentions(CONTACTS, 'buyer').map((c) => c.fullName)).toEqual([
      'Sarah Jenkins',
    ]);
    expect(filterContactMentions(CONTACTS, 'john').map((c) => c.id)).toEqual(['c2']);
  });

  it('formats insertions', () => {
    expect(formatProductMention(ITEMS[0]!)).toBe('Old Guys Rule Classic Tee (SKU: OG2511)');
    expect(formatContactMention(CONTACTS[0]!)).toBe('Sarah Jenkins [Buyer]');
  });

  it('replaces @query and advances caret', () => {
    const value = 'Spoke with @Sar';
    const trigger = parseActiveMention(value, value.length)!;
    const result = applyMentionReplacement(
      value,
      trigger.start,
      value.length,
      formatContactMention(CONTACTS[0]!),
    );
    expect(result.value).toBe('Spoke with Sarah Jenkins [Buyer] ');
    expect(result.caret).toBe(result.value.length);
  });
});
