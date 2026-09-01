import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  aggregateVintageGoodsLinesBySku,
  normalizeVintageGoodsPdfText,
  parseGluedInvoiceTail,
  parseVintageGoodsInvoiceText,
  topVintageGoodsSkus,
} from '@/lib/accountInvoices/parseVintageGoodsInvoice';
import {
  matchAccountByBillToName,
  normalizeBillToName,
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

  it('parses pdf-parse output with NBSP and glued qty/rate/amount', () => {
    const pdfText = normalizeVintageGoodsPdfText(`
Invoice
DateInvoice #
10/3/202571878
Bill\u00a0To
The\u00a0Man\u00a0Store
Ship To
The Man Store
ItemDescriptionInvoicedRateAmountTax
OG2017 M BLKBLK THE DREAM M213.0026.00Non
OG2017 L BLKBLK THE DREAM LG513.0065.00Non
`);
    const parsed = parseVintageGoodsInvoiceText(pdfText);
    expect(parsed).not.toBeNull();
    expect(parsed!.invoiceNumber).toBe('71878');
    expect(parsed!.billToName).toBe('The Man Store');
    expect(parsed!.lines.length).toBe(2);
    expect(parsed!.lines[0]?.quantity).toBe(2);
    expect(parsed!.lines[1]?.quantity).toBe(5);
  });
});

describe('parseGluedInvoiceTail', () => {
  it('splits compact line endings from Vintage Goods PDFs', () => {
    expect(parseGluedInvoiceTail('OG2017 M BLKBLK THE DREAM M213.0026.00Non')).toEqual({
      quantity: 2,
      rate: '13.00',
      amount: '26.00',
    });
    expect(parseGluedInvoiceTail('LOCAL LEGEND CAP NAVY1212.50150.00Non')).toEqual({
      quantity: 12,
      rate: '12.50',
      amount: '150.00',
    });
    expect(parseGluedInvoiceTail('LOCAL LEGEND BADGE CAP GREEN (backorder)12.500.00Non')).toEqual({
      quantity: 1,
      rate: '12.50',
      amount: '0.00',
    });
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
    expect(matchAccountByBillToName('BIG WHEEL GENERAL STORE', candidates)?.id).toBe(613);
  });

  it('normalizes glued pdf bill-to names and token-overlap matches', () => {
    expect(normalizeBillToName("LeMayAmerica's Car Museum")).toBe('lemay america s car museum');
    const leMayCandidates = [
      { id: 621, name: "LeMay America's Car Museum" },
      { id: 900, name: 'The Man Store' },
    ];
    expect(matchAccountByBillToName("LeMayAmerica's Car Museum", leMayCandidates)?.id).toBe(621);
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
