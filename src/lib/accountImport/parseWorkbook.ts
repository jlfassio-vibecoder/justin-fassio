import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { ParsedWorkbook } from '@/lib/accountImport/types';

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function cellToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
    return value.text.trim();
  }
  if (typeof value === 'object' && 'result' in value) {
    return cellToString((value as { result: unknown }).result);
  }
  return String(value).trim();
}

function worksheetToParsed(ws: ExcelJS.Worksheet): ParsedWorkbook {
  const headerRow = ws.getRow(1);
  const headerByCol = new Map<number, string>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = cellToString(cell.value);
    if (header) headerByCol.set(colNumber, header);
  });
  const headers = [...headerByCol.values()];

  const rows: Record<string, string>[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, string> = {};
    let any = false;
    for (const [colNumber, header] of headerByCol) {
      const value = cellToString(row.getCell(colNumber).value);
      record[header] = value;
      if (value) any = true;
    }
    if (any) rows.push(record);
  });

  return {
    headers,
    rows,
    sheetName: ws.name || 'Sheet1',
  };
}

export async function parseWorkbookBuffer(input: {
  bytes: Uint8Array;
  filename: string;
}): Promise<{ ok: true; workbook: ParsedWorkbook } | { ok: false; error: string }> {
  const filename = input.filename.toLowerCase();
  const workbook = new ExcelJS.Workbook();
  try {
    if (filename.endsWith('.csv')) {
      const stream = Readable.from(Buffer.from(input.bytes));
      await workbook.csv.read(stream);
    } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
      const copy = new ArrayBuffer(input.bytes.byteLength);
      new Uint8Array(copy).set(input.bytes);
      await workbook.xlsx.load(copy);
    } else {
      return { ok: false, error: 'File must be .xlsx or .csv' };
    }
  } catch {
    return { ok: false, error: 'Could not parse the spreadsheet' };
  }

  const first = workbook.worksheets[0];
  if (!first) return { ok: false, error: 'Workbook has no worksheets' };
  return { ok: true, workbook: worksheetToParsed(first) };
}
