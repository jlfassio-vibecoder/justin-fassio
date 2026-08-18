import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseShipTo } from '@/lib/accountImport/addressParse';
import { collapseInFileDuplicates } from '@/lib/accountImport/collapseDuplicates';
import { isBusinessNameMapped, proposeColumnMap } from '@/lib/accountImport/columnMap';
import { importFingerprint } from '@/lib/accountImport/fingerprint';
import { isImportableEmail, normalizeWorkbookRows } from '@/lib/accountImport/normalize';
import { parseWorkbookBuffer } from '@/lib/accountImport/parseWorkbook';
import { territoryCodeFromImportState } from '@/lib/accountImport/territory';
import { HISTORICAL_OGR_IMPORT_DEFAULTS } from '@/lib/accountImport/classification';
import type { AccountImportColumnMap } from '@/lib/accountImport/types';

const HISTORICAL_MAP: AccountImportColumnMap = {
  businessName: 'Business name',
  shipTo: 'Ship To',
  formerRepCode: 'Former rep',
};

function peninsulaRows(): Record<string, string>[] {
  const unique = [
    'Coast Outfitters',
    'Harbor Dry Goods',
    'Pine Ridge Pharmacy',
    'Sunset Tackle',
    'Cedar & Salt',
    'North Jetty Supply',
    'Trailhead Mercantile',
    'Blue Heron Market',
    'Fog Line Apparel',
    'Westport Hardware',
    'Salish Sea Gifts',
    'Rainier Outfitters',
    'Olympic Coast Co',
    'Willamette Dry Goods',
    'Columbia Gorge Supply',
    'Astoria Trading',
    'Cannon Beach Mercantile',
    'Hood River Outfitters',
    'Bend General Store',
    'Eugene Outdoor Co',
    'Salem Hardware',
    'Tacoma Tackle',
    'Spokane Dry Goods',
  ];
  const rows = unique.map((name, i) => ({
    'Business name': name,
    'Ship To':
      i % 2 === 0
        ? `100 Main St, Portland, OR 9720${i % 10}`
        : `200 Pine St, Seattle, WA 9810${i % 10}`,
    'Former rep': 'R1',
  }));
  rows.push({
    'Business name': 'PENINSULA PHARMACIES, INC',
    'Ship To': '19909 7th Ave NE, Poulsbo, WA 98370',
    'Former rep': 'R2',
  });
  rows.push({
    'Business name': 'Peninsula Pharmacies, Inc.',
    'Ship To': '19909 7th Avenue NE, Poulsbo, WA 98370-6511',
    'Former rep': '',
  });
  return rows;
}

describe('account import territory', () => {
  it('maps OR/WA only and never defaults to BC', () => {
    expect(territoryCodeFromImportState('OR')).toBe('or');
    expect(territoryCodeFromImportState('Washington')).toBe('wa');
    expect(territoryCodeFromImportState('')).toBeNull();
    expect(territoryCodeFromImportState('BC')).toBeNull();
    expect(territoryCodeFromImportState('California')).toBeNull();
  });
});

describe('account import parser', () => {
  it('parses xlsx and csv from the first worksheet', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Accounts');
    ws.addRow(['Business name', 'Ship To']);
    ws.addRow(['Coast Outfitters', '12 Oak St, Portland, OR 97201']);
    const xlsx = Buffer.from(await wb.xlsx.writeBuffer());
    const xlsxParsed = await parseWorkbookBuffer({ bytes: xlsx, filename: 'accounts.xlsx' });
    expect(xlsxParsed.ok).toBe(true);
    if (!xlsxParsed.ok) return;
    expect(xlsxParsed.workbook.headers).toEqual(['Business name', 'Ship To']);
    expect(xlsxParsed.workbook.rows[0]?.['Business name']).toBe('Coast Outfitters');

    const csv = Buffer.from(
      'Business name,Ship To\nCoast Outfitters,"12 Oak St, Portland, OR 97201"\n',
    );
    const csvParsed = await parseWorkbookBuffer({ bytes: csv, filename: 'accounts.csv' });
    expect(csvParsed.ok).toBe(true);
    if (!csvParsed.ok) return;
    expect(csvParsed.workbook.rows[0]?.['Business name']).toBe('Coast Outfitters');
  });

  it('detects historical aliases and requires business name', () => {
    const map = proposeColumnMap(['Account', 'Shipping address', 'Rep code', 'Notes']);
    expect(map.businessName).toBe('Account');
    expect(map.shipTo).toBe('Shipping address');
    expect(map.formerRepCode).toBe('Rep code');
    expect(isBusinessNameMapped(map)).toBe(true);
    expect(isBusinessNameMapped({})).toBe(false);
  });
});

describe('account import normalize', () => {
  it('parses OR/WA ship-to and does not store invalid email', () => {
    const rows = normalizeWorkbookRows(
      [
        {
          'Business name': 'Coast Outfitters',
          'Ship To': '12 Oak St, Portland, OR 97201, USA',
          Email: 'not-an-email',
        },
      ],
      { ...HISTORICAL_MAP, email: 'Email' },
    );
    expect(rows[0]?.stateCode).toBe('or');
    expect(rows[0]?.region).toBe('Oregon');
    expect(rows[0]?.email).toBeNull();
    expect(rows[0]?.emailImportable).toBe(false);
    expect(isImportableEmail('buyer@store.example')).toBe(true);
  });

  it('treats ZIP without state as a suggestion only', () => {
    const parsed = parseShipTo('12 Oak St, Portland, 97201');
    expect(parsed.stateCode).toBeNull();
    expect(parsed.suggestedStateCode).toBe('or');
    expect(parsed.warnings.some((w) => /ZIP suggests/i.test(w))).toBe(true);
  });
});

describe('account import fingerprint and collapse', () => {
  it('fingerprints normalized name + state + ZIP5', () => {
    expect(
      importFingerprint({ name: 'Peninsula Pharmacies, Inc.', stateCode: 'wa', postal5: '98370' }),
    ).toBe(
      importFingerprint({
        name: 'PENINSULA PHARMACIES INC',
        stateCode: 'wa',
        postal5: '98370-6511',
      }),
    );
  });

  it('collapses the Peninsula-style 25-row fixture to 24 businesses', () => {
    const rows = peninsulaRows();
    expect(rows).toHaveLength(25);
    const normalized = normalizeWorkbookRows(rows, HISTORICAL_MAP);
    const collapsed = collapseInFileDuplicates(normalized);
    const unique = collapsed.filter((row) => row.inFileDuplicateOf == null);
    const dupes = collapsed.filter((row) => row.inFileDuplicateOf != null);
    expect(unique).toHaveLength(24);
    expect(dupes).toHaveLength(1);
    expect(unique.some((row) => /peninsula pharmacies/i.test(row.name))).toBe(true);
    expect(HISTORICAL_OGR_IMPORT_DEFAULTS.createOrders).toBe(false);
  });

  it('does not auto-collapse the same name when state and ZIP are both missing', () => {
    const normalized = normalizeWorkbookRows(
      [
        { 'Business name': 'Same Store', 'Ship To': '' },
        { 'Business name': 'Same Store', 'Ship To': '' },
      ],
      HISTORICAL_MAP,
    );
    const collapsed = collapseInFileDuplicates(normalized);
    expect(collapsed.every((row) => row.inFileDuplicateOf == null)).toBe(true);
    expect(
      collapsed.every((row) => row.warnings.some((w) => /missing state and ZIP/i.test(w))),
    ).toBe(true);
  });
});
