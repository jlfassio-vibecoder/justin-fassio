/**
 * Parse Vintage Goods Apparel wholesale invoice PDF text (OGR).
 * Pure text parser — tests use fixtures; CLI uses pdf-parse extraction.
 */

import { extractBaseSkuFromInvoiceLine } from '@/lib/accountInvoices/extractBaseSku';

export type ParsedVintageGoodsInvoiceLine = {
  skuBase: string;
  styleName: string;
  quantity: number;
  rawLine: string;
};

export type ParsedVintageGoodsInvoice = {
  invoiceNumber: string;
  invoiceDate: string;
  billToName: string;
  lines: ParsedVintageGoodsInvoiceLine[];
};

export type AggregatedInvoiceSku = {
  skuBase: string;
  styleName: string;
  totalQuantity: number;
};

/** Line ends with qty, unit rate, line amount (Vintage Goods layout). */
const COMPLETE_LINE_RE = /\s(\d+)\s+\d+\.\d{2}\s+\d+\.\d{2}(?:\s+Non)?\s*$/i;

const INVOICE_META_RE = /(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d+)/;

function parseUsDateToIso(raw: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
  if (!m) return raw.trim();
  const month = m[1]!.padStart(2, '0');
  const day = m[2]!.padStart(2, '0');
  return `${m[3]}-${month}-${day}`;
}

function extractStyleName(line: string, skuBase: string): string {
  let rest = line.trim();
  if (rest.toUpperCase().startsWith(skuBase)) {
    rest = rest.slice(skuBase.length).trim();
  }
  rest = rest.replace(COMPLETE_LINE_RE, '').trim();
  rest = rest.replace(/\b(M|L|XL|2X|3X|4X|5X|S)\b/gi, ' ');
  rest = rest.replace(
    /\b(BLK|BLU|NAVY|GRAVEL|WHITE|RED|GRN|GRY|GRAPH\s*HEA|DKGRAPHITEHEA)\b/gi,
    ' ',
  );
  rest = rest.replace(/\s+/g, ' ').trim();
  const tokens = rest.split(' ').filter(Boolean);
  if (tokens.length === 0) return skuBase;
  const upperTokens = tokens.filter((t) => t === t.toUpperCase() && t.length > 1);
  if (upperTokens.length >= 2) {
    return upperTokens.slice(0, 4).join(' ');
  }
  return tokens.slice(0, 4).join(' ');
}

function parseLineItem(rawLine: string): ParsedVintageGoodsInvoiceLine | null {
  const line = rawLine.replace(/\s+/g, ' ').trim();
  if (!/^OG/i.test(line) || !COMPLETE_LINE_RE.test(line)) return null;
  const skuBase = extractBaseSkuFromInvoiceLine(line);
  if (!skuBase) return null;
  const qtyMatch = COMPLETE_LINE_RE.exec(line);
  if (!qtyMatch) return null;
  const quantity = Number.parseInt(qtyMatch[1]!, 10);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  return {
    skuBase,
    styleName: extractStyleName(line, skuBase),
    quantity,
    rawLine: line,
  };
}

/** Merge wrapped PDF lines until a complete item line is formed. */
export function collectVintageGoodsItemLines(text: string): string[] {
  const physicalLines = text.split(/\r?\n/);
  const completed: string[] = [];
  let buffer = '';

  for (const physical of physicalLines) {
    const trimmed = physical.trim();
    if (!trimmed) continue;
    if (/^--\s+\d+\s+of\s+\d+\s+--$/i.test(trimmed)) continue;
    if (
      /^(VINTAGE GOODS|Invoice|Date|Bill To|Ship To|Item|SUB TOTAL|All work is complete)/i.test(
        trimmed,
      )
    ) {
      buffer = '';
      continue;
    }

    if (/^OG/i.test(trimmed)) {
      if (buffer) {
        const prev = parseLineItem(buffer);
        if (prev) completed.push(buffer.replace(/\s+/g, ' ').trim());
      }
      buffer = trimmed;
    } else if (buffer) {
      buffer = `${buffer} ${trimmed}`;
    }

    if (buffer && COMPLETE_LINE_RE.test(buffer.replace(/\s+/g, ' '))) {
      const parsed = parseLineItem(buffer);
      if (parsed) {
        completed.push(buffer.replace(/\s+/g, ' ').trim());
        buffer = '';
      }
    }
  }

  if (buffer) {
    const parsed = parseLineItem(buffer);
    if (parsed) completed.push(buffer.replace(/\s+/g, ' ').trim());
  }

  return [...new Set(completed)];
}

export function parseVintageGoodsInvoiceText(text: string): ParsedVintageGoodsInvoice | null {
  const normalized = text.replace(/\r\n/g, '\n');
  const metaMatch = INVOICE_META_RE.exec(normalized);
  if (!metaMatch) return null;

  const invoiceDate = parseUsDateToIso(metaMatch[1]!);
  const invoiceNumber = metaMatch[2]!.trim();

  const billToIdx = normalized.search(/\bBill To\b/i);
  let billToName = '';
  if (billToIdx >= 0) {
    const after = normalized.slice(billToIdx).split('\n');
    for (let i = 1; i < after.length && i < 8; i++) {
      const row = after[i]?.trim() ?? '';
      if (!row) continue;
      if (/^(Ship To|P\.?O\.|ATTN:|Item\b)/i.test(row)) break;
      if (!billToName && !/^P\.?O\.?\s*Box/i.test(row) && !/^\d/.test(row)) {
        billToName = row;
        break;
      }
    }
  }

  const rawLines = collectVintageGoodsItemLines(normalized);
  const lines: ParsedVintageGoodsInvoiceLine[] = [];
  for (const rawLine of rawLines) {
    const parsed = parseLineItem(rawLine);
    if (parsed) lines.push(parsed);
  }
  if (lines.length === 0) return null;

  return {
    invoiceNumber,
    invoiceDate,
    billToName: billToName.trim(),
    lines,
  };
}

/** Sum quantities per base SKU; preserve a representative style name. */
export function aggregateVintageGoodsLinesBySku(
  lines: ParsedVintageGoodsInvoiceLine[],
): AggregatedInvoiceSku[] {
  const bySku = new Map<string, AggregatedInvoiceSku>();
  for (const line of lines) {
    const prev = bySku.get(line.skuBase);
    if (!prev) {
      bySku.set(line.skuBase, {
        skuBase: line.skuBase,
        styleName: line.styleName,
        totalQuantity: line.quantity,
      });
    } else {
      prev.totalQuantity += line.quantity;
      if (line.styleName.length > prev.styleName.length) {
        prev.styleName = line.styleName;
      }
    }
  }
  return [...bySku.values()].sort(
    (a, b) => b.totalQuantity - a.totalQuantity || a.skuBase.localeCompare(b.skuBase),
  );
}

export function topVintageGoodsSkus(
  lines: ParsedVintageGoodsInvoiceLine[],
  limit = 5,
): AggregatedInvoiceSku[] {
  return aggregateVintageGoodsLinesBySku(lines).slice(0, limit);
}
