/**
 * Pure parser and validator for the Wyld wholesale price list.
 * The vendor file stays outside git. Callers pass file text plus provenance.
 */

export const WYLD_PRICE_LIST_EFFECTIVE_DATE = '2026-06-01';
export const WYLD_PRICE_LIST_SEASON = 'Summer-Fall 2026';

export const KNOWN_DUPLICATE_UPC = '810031808939';
export const KNOWN_DUPLICATE_UPC_SKUS = ['24-MAG-OL', '34-MAG-OL'] as const;
export const KNOWN_DUPLICATE_UPC_REASON =
  'Source price list assigns UPC 810031808939 to both 24-MAG-OL and 34-MAG-OL. Values were not rewritten.';

const ACCESSORY_KEYS = new Set([
  'mag-flask-straw-lid-fits-all-sizes',
  'mag-flask-flip-lid-fits-all-sizes',
  'wyld-cup-straw-lid-16oz',
  'wyld-cup-straw-lid-24oz-and-30oz-wt',
  'wyld-cup-straw-lid-32oz',
  'cooler-aerator',
  'wyld-ice-3-pack',
]);

export type WyldStagingRow = {
  sourceRowNumber: number;
  familyKey: string;
  familyName: string;
  category: string;
  capacity: string | null;
  color: string | null;
  sku: string;
  upc: string;
  wholesaleUsd: number;
  msrpUsd: number;
  currency: 'USD';
  madeInUsa: boolean;
};

export type WyldImportConflict = {
  sku: string;
  fieldPath: string;
  status: 'open' | 'accepted_source_exception';
  resolutionNote: string | null;
  proposedValue: string;
};

export type WyldParseResult = {
  rows: WyldStagingRow[];
  conflicts: WyldImportConflict[];
  skippedRowNumbers: number[];
};

export function familyKeyFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function capacityFromFamilyName(name: string): string | null {
  const quarts = name.match(/\b(\d+)\s*q(?:t)?\b/i);
  if (quarts?.[1]) return `${quarts[1]}Q`;
  const ounces = name.match(/\b(\d+)\s*oz\b/i);
  if (ounces?.[1]) return `${ounces[1]} oz`;
  return null;
}

function parseMoney(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Minimal CSV split that keeps quoted commas. */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function categoryFromHeader(header: string): string | null {
  const normalized = header.trim().toLowerCase();
  if (normalized.startsWith('hard coolers')) return 'Hard Coolers';
  if (normalized.startsWith('soft coolers')) return 'Soft Coolers';
  if (normalized.startsWith('drinkware')) return 'Drinkware';
  if (normalized.startsWith('accessories')) return 'Accessories';
  return null;
}

function isSkuRow(cells: string[]): boolean {
  const sku = cells[4]?.trim() ?? '';
  return sku.length > 0 && sku.toLowerCase() !== 'sku';
}

export function parseWyldPriceList(csvText: string): WyldParseResult {
  const lines = csvText.split(/\r?\n/);
  let category = '';
  const rows: WyldStagingRow[] = [];
  const skippedRowNumbers: number[] = [];

  lines.forEach((line, index) => {
    const sourceRowNumber = index + 1;
    if (!line.trim()) return;
    const cells = parseCsvLine(line);
    const headerCategory = categoryFromHeader(cells[0] ?? '');
    if (headerCategory) {
      category = headerCategory;
      return;
    }
    if (!isSkuRow(cells)) {
      if ((cells[0] ?? '').trim() || (cells[5] ?? '').trim())
        skippedRowNumbers.push(sourceRowNumber);
      return;
    }

    const namedInColorColumn = !(cells[1] ?? '').trim() && Boolean((cells[2] ?? '').trim());
    const familyName = (namedInColorColumn ? cells[2] : (cells[1] ?? '')).trim();
    const familyKey = familyKeyFromName(familyName);
    const resolvedCategory = ACCESSORY_KEYS.has(familyKey) ? 'Accessories' : category;
    const wholesaleUsd = parseMoney(cells[5]);
    const msrpUsd = parseMoney(cells[6]);
    const color = namedInColorColumn ? '' : (cells[2] ?? '').trim();
    rows.push({
      sourceRowNumber,
      familyKey,
      familyName,
      category: resolvedCategory,
      capacity: capacityFromFamilyName(familyName),
      color: color || null,
      sku: (cells[4] ?? '').trim(),
      upc: (cells[3] ?? '').trim(),
      wholesaleUsd: wholesaleUsd ?? Number.NaN,
      msrpUsd: msrpUsd ?? Number.NaN,
      currency: 'USD',
      madeInUsa: resolvedCategory === 'Hard Coolers' || /made in usa/i.test(familyName),
    });
  });

  return { rows, conflicts: validateWyldRows(rows), skippedRowNumbers };
}

export function validateWyldRows(rows: WyldStagingRow[]): WyldImportConflict[] {
  const conflicts: WyldImportConflict[] = [];
  const skuSeen = new Map<string, number>();
  const upcSeen = new Map<string, string[]>();

  for (const row of rows) {
    const priorSku = skuSeen.get(row.sku);
    if (priorSku != null) {
      conflicts.push({
        sku: row.sku,
        fieldPath: 'sku',
        status: 'open',
        resolutionNote: null,
        proposedValue: `duplicate SKU also on source row ${priorSku}`,
      });
    } else {
      skuSeen.set(row.sku, row.sourceRowNumber);
    }

    if (!row.familyKey || !row.familyName) {
      conflicts.push({
        sku: row.sku,
        fieldPath: 'family',
        status: 'open',
        resolutionNote: null,
        proposedValue: 'missing product family',
      });
    }
    if (!row.category) {
      conflicts.push({
        sku: row.sku,
        fieldPath: 'category',
        status: 'open',
        resolutionNote: null,
        proposedValue: 'missing category',
      });
    }
    if (!Number.isFinite(row.wholesaleUsd)) {
      conflicts.push({
        sku: row.sku,
        fieldPath: 'wholesale_price',
        status: 'open',
        resolutionNote: null,
        proposedValue: 'missing wholesale price',
      });
    }
    if (!Number.isFinite(row.msrpUsd)) {
      conflicts.push({
        sku: row.sku,
        fieldPath: 'retail_price',
        status: 'open',
        resolutionNote: null,
        proposedValue: 'missing retail price',
      });
    }
    if (!row.upc) {
      conflicts.push({
        sku: row.sku,
        fieldPath: 'upc',
        status: 'open',
        resolutionNote: null,
        proposedValue: 'missing UPC',
      });
    } else {
      const skus = upcSeen.get(row.upc) ?? [];
      skus.push(row.sku);
      upcSeen.set(row.upc, skus);
    }
  }

  for (const [upc, skus] of upcSeen) {
    if (skus.length < 2) continue;
    const known =
      upc === KNOWN_DUPLICATE_UPC &&
      skus.length === KNOWN_DUPLICATE_UPC_SKUS.length &&
      KNOWN_DUPLICATE_UPC_SKUS.every((sku) => skus.includes(sku));
    for (const sku of skus) {
      conflicts.push({
        sku,
        fieldPath: 'upc',
        status: known ? 'accepted_source_exception' : 'open',
        resolutionNote: known ? KNOWN_DUPLICATE_UPC_REASON : null,
        proposedValue: upc,
      });
    }
  }

  return conflicts;
}

export function blockingConflicts(conflicts: WyldImportConflict[]): WyldImportConflict[] {
  return conflicts.filter((conflict) => conflict.status === 'open');
}

export function departmentForCategory(category: string): string | null {
  if (
    category === 'Hard Coolers' ||
    category === 'Soft Coolers' ||
    category === 'Drinkware' ||
    category === 'Accessories'
  ) {
    return category;
  }
  return null;
}
