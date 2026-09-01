/**
 * Parse Vintage Goods Apparel wholesale invoice PDF text (OGR).
 * Pure text parser — tests use fixtures; CLI uses pdf-parse extraction.
 */

import { extractBaseSkuFromInvoiceLine } from './extractBaseSku.ts';

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
  shipToName: string;
  lines: ParsedVintageGoodsInvoiceLine[];
};

export type AggregatedInvoiceSku = {
  skuBase: string;
  styleName: string;
  totalQuantity: number;
};

type ParsedInvoiceTail = {
  quantity: number;
  rate: string;
  amount: string;
};

/** Line ends with qty, unit rate, line amount (spaced fixture layout). */
const SPACED_COMPLETE_LINE_RE = /\s(\d+)\s+\d+\.\d{2}\s+\d+\.\d{2}(?:\s+Non)?\s*$/i;

const INVOICE_META_RE = /(\d{1,2}\/\d{1,2}\/\d{4})\s*(\d+)/;

/** pdf-parse uses NBSP and omits spaces between qty/rate/amount. */
export function normalizeVintageGoodsPdfText(text: string): string {
  return text
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/\u00ad/g, '')
    .replace(/\r\n/g, '\n');
}

function parseUsDateToIso(raw: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
  if (!m) return raw.trim();
  const month = m[1]!.padStart(2, '0');
  const day = m[2]!.padStart(2, '0');
  return `${m[3]}-${month}-${day}`;
}

/** Parse qty/rate/amount glued at line end (e.g. M213.0026.00Non). */
export function parseGluedInvoiceTail(line: string): ParsedInvoiceTail | null {
  const rest = line.trim().replace(/\s*Non\s*$/i, '');

  const backorderZero = /(\d{2}\.\d{2})0\.00$/.exec(rest);
  if (backorderZero) {
    const rate = Number.parseFloat(backorderZero[1]!);
    if (rate >= 8 && rate <= 20) {
      return { quantity: 1, rate: backorderZero[1]!, amount: '0.00' };
    }
  }

  const twoDigitRate = (() => {
    for (let qtyLen = 3; qtyLen >= 1; qtyLen -= 1) {
      const re = new RegExp(`(\\d{${qtyLen}})(\\d{2}\\.\\d{2})(\\d+\\.\\d{2})$`);
      const m = re.exec(rest);
      if (!m) continue;
      const rate = Number.parseFloat(m[2]!);
      const quantity = Number.parseInt(m[1]!, 10);
      if (rate >= 8 && rate <= 20 && Number.isFinite(quantity) && quantity > 0 && quantity <= 99) {
        return m;
      }
    }
    return null;
  })();
  if (twoDigitRate) {
    return {
      quantity: Number.parseInt(twoDigitRate[1]!, 10),
      rate: twoDigitRate[2]!,
      amount: twoDigitRate[3]!,
    };
  }

  const flexibleRate = (() => {
    for (let qtyLen = 3; qtyLen >= 1; qtyLen -= 1) {
      const re = new RegExp(`(\\d{${qtyLen}})(\\d{1,2}\\.\\d{2})(\\d+\\.\\d{2})$`);
      const m = re.exec(rest);
      if (!m) continue;
      const rate = Number.parseFloat(m[2]!);
      const quantity = Number.parseInt(m[1]!, 10);
      if (rate >= 8 && rate <= 20 && Number.isFinite(quantity) && quantity > 0 && quantity <= 99) {
        return m;
      }
    }
    return null;
  })();
  if (flexibleRate) {
    return {
      quantity: Number.parseInt(flexibleRate[1]!, 10),
      rate: flexibleRate[2]!,
      amount: flexibleRate[3]!,
    };
  }
  return null;
}

function isCompleteVintageGoodsLine(line: string): boolean {
  const compact = line.replace(/\s+/g, ' ').trim();
  return SPACED_COMPLETE_LINE_RE.test(compact) || parseGluedInvoiceTail(compact) != null;
}

function parseLineTail(line: string): ParsedInvoiceTail | null {
  const compact = line.replace(/\s+/g, ' ').trim();
  const spaced = SPACED_COMPLETE_LINE_RE.exec(compact);
  if (spaced) {
    const quantity = Number.parseInt(spaced[1]!, 10);
    if (Number.isFinite(quantity) && quantity > 0) {
      return { quantity, rate: '', amount: '' };
    }
  }
  return parseGluedInvoiceTail(compact);
}

function stripLineTail(line: string): string {
  const compact = line.replace(/\s+/g, ' ').trim();
  if (SPACED_COMPLETE_LINE_RE.test(compact)) {
    return compact.replace(SPACED_COMPLETE_LINE_RE, '').trim();
  }
  const tail = parseGluedInvoiceTail(compact);
  if (!tail) return compact;
  const gluedTail = /(\d+)(\d{1,2}\.\d{2})(\d+\.\d{2})(\s*Non)?\s*$/i.exec(compact);
  if (!gluedTail) return compact;
  return compact.slice(0, gluedTail.index).trim();
}

function extractStyleName(line: string, skuBase: string): string {
  let rest = stripLineTail(line);
  if (rest.toUpperCase().startsWith(skuBase)) {
    rest = rest.slice(skuBase.length).trim();
  }
  rest = rest.replace(/\b(M|L|XL|2X|3X|4X|5X|S|LG)\b/gi, ' ');
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
  if (!/^OG/i.test(line) || !isCompleteVintageGoodsLine(line)) return null;
  const skuBase = extractBaseSkuFromInvoiceLine(line);
  if (!skuBase) return null;
  const tail = parseLineTail(line);
  if (!tail) return null;
  return {
    skuBase,
    styleName: extractStyleName(line, skuBase),
    quantity: tail.quantity,
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

    if (buffer && isCompleteVintageGoodsLine(buffer.replace(/\s+/g, ' '))) {
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

function extractAccountNameBlock(text: string, label: 'Bill To' | 'Ship To'): string {
  const idx = text.search(new RegExp(`\\b${label}\\b`, 'i'));
  if (idx < 0) return '';
  const after = text.slice(idx).split('\n');
  for (let i = 1; i < after.length && i < 8; i++) {
    const row = after[i]?.trim() ?? '';
    if (!row) continue;
    if (/^(Ship To|Bill To|P\.?O\.|PO BOX|ATTN:|Item\b)/i.test(row)) break;
    if (!/^P\.?O\.?\s*Box/i.test(row) && !/^\d/.test(row)) {
      return row;
    }
  }
  return '';
}

export function parseVintageGoodsInvoiceText(text: string): ParsedVintageGoodsInvoice | null {
  const normalized = normalizeVintageGoodsPdfText(text);
  const metaMatch = INVOICE_META_RE.exec(normalized);
  if (!metaMatch) return null;

  const invoiceDate = parseUsDateToIso(metaMatch[1]!);
  const invoiceNumber = metaMatch[2]!.trim();

  const billToName = extractAccountNameBlock(normalized, 'Bill To');
  const shipToName = extractAccountNameBlock(normalized, 'Ship To');

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
    shipToName: shipToName.trim(),
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
