import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  aggregateVintageGoodsLinesBySku,
  parseVintageGoodsInvoiceText,
  topVintageGoodsSkus,
} from '@/lib/accountInvoices/parseVintageGoodsInvoice';
import {
  matchAccountByBillToName,
  prospectIdFromInvoiceFilename,
  resolveAccountForInvoice,
} from '@/lib/accountInvoices/matchAccount';
import {
  buildCatalogSkuIndex,
  matchCatalogItemIdForInvoiceSku,
} from '@/lib/accountInvoices/matchCatalogSku';

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/invoice71878.txt');
const fixtureText = readFileSync(fixturePath, 'utf8');

describe('parseVintageGoodsInvoiceText', () => {
  it('parses invoice 71878 header and line items', () => {
    const parsed = parseVintageGoodsInvoiceText(fixtureText);
    expect(parsed).not.toBeNull();
    expect(parsed!.invoiceNumber).toBe('71878');
    expect(parsed!.invoiceDate).toBe('2025-10-03');
    expect(parsed!.billToName).toBe('The Man Store');
    expect(parsed!.lines.length).toBeGreaterThan(10);
  });

  it('aggregates size runs per base SKU and dedupes repeated PDF lines', () => {
    const parsed = parseVintageGoodsInvoiceText(fixtureText);
    expect(parsed).not.toBeNull();
    const aggregated = aggregateVintageGoodsLinesBySku(parsed!.lines);
    const og2017 = aggregated.find((row) => row.skuBase === 'OG2017');
    expect(og2017?.totalQuantity).toBe(19);
    const og2160 = aggregated.find((row) => row.skuBase === 'OG2160');
    expect(og2160?.totalQuantity).toBe(19);
    const mugs = aggregated.find((row) => row.skuBase === 'OGAM438');
    expect(mugs?.totalQuantity).toBe(6);
  });

  it('ranks OG2017 first among tied top apparel quantities', () => {
    const parsed = parseVintageGoodsInvoiceText(fixtureText);
    expect(parsed).not.toBeNull();
    const top = topVintageGoodsSkus(parsed!.lines, 3);
    expect(top[0]?.skuBase).toBe('OG2017');
    expect(top[0]?.totalQuantity).toBe(19);
  });
});

describe('matchAccount', () => {
  const candidates = [
    { id: 613, name: 'Big Wheel General Store' },
    { id: 900, name: 'The Man Store' },
  ];

  it('reads prospect id from filename', () => {
    expect(prospectIdFromInvoiceFilename('613.pdf')).toBe(613);
    expect(prospectIdFromInvoiceFilename('900-invoice.pdf')).toBe(900);
  });

  it('matches bill-to name to active account', () => {
    expect(matchAccountByBillToName('The Man Store', candidates)?.id).toBe(900);
  });

  it('prefers explicit filename id when present', () => {
    const match = resolveAccountForInvoice({
      filename: '613.pdf',
      billToName: 'The Man Store',
      candidates,
    });
    expect(match?.id).toBe(613);
  });
});

describe('matchCatalogSku', () => {
  it('maps invoice base SKU to catalog item id', () => {
    const index = buildCatalogSkuIndex([
      { id: 'cat-2017', sku: 'OG2017', normalized_sku: 'OG2017', live_sku: null },
      { id: 'cat-am', sku: 'OGAM438', normalized_sku: 'OGAM438', live_sku: null },
    ]);
    expect(matchCatalogItemIdForInvoiceSku('OG2017', index)).toBe('cat-2017');
    expect(matchCatalogItemIdForInvoiceSku('OGAM438', index)).toBe('cat-am');
  });
});
