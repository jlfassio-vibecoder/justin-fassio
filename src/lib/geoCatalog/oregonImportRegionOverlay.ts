import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  normalizeOregonPrimaryDistrict,
  type OregonCrmRegion,
  type OregonImportRegionOverlay,
} from '@/lib/geoCatalog/suggestOregonCrmRegion';

const OREGON_UPLOADS_DIR = resolve(process.cwd(), 'docs/prospect-uploads/oregon');

/** Batch-default region when CSV has no primary_district column. */
const BATCH_DEFAULT_REGION: Readonly<Record<string, OregonCrmRegion>> = {
  'bandon-corridor-20260825.csv': 'Oregon Coast',
  'central-oregon-20260825.csv': 'Central Oregon',
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1).map((line) => parseCsvLine(line));
  return { headers, rows };
}

function colIndex(headers: string[], ...names: string[]): number {
  for (const name of names) {
    const i = headers.indexOf(name.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

function parseCrmId(raw: string): number | null {
  const n = Number(raw.trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function regionFromRow(
  headers: string[],
  row: string[],
  batchDefault: OregonCrmRegion | null,
): OregonCrmRegion | null {
  const districtIdx = colIndex(headers, 'primary_district');
  if (districtIdx >= 0) {
    const district = row[districtIdx]?.trim();
    const normalized = normalizeOregonPrimaryDistrict(district);
    if (normalized) return normalized;
  }
  return batchDefault;
}

function normalizeNameKey(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[–—]/g, '-');
}

function loadCsvOverlayFile(
  filename: string,
  byProspectId: Map<number, OregonCrmRegion>,
  byExternalId: Map<string, OregonCrmRegion>,
  byNormalizedName: Map<string, OregonCrmRegion>,
): void {
  const path = resolve(OREGON_UPLOADS_DIR, filename);
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return;
  }

  const batchDefault = BATCH_DEFAULT_REGION[filename] ?? null;
  const { headers, rows } = parseCsv(content);
  if (headers.length === 0) return;

  const crmIdx = colIndex(headers, 'crm_id');
  const extIdx = colIndex(headers, 'external_id');
  const nameIdx = colIndex(headers, 'name', 'business_name');

  for (const row of rows) {
    const region = regionFromRow(headers, row, batchDefault);
    if (!region) continue;

    if (crmIdx >= 0) {
      const id = parseCrmId(row[crmIdx] ?? '');
      if (id != null) byProspectId.set(id, region);
    }
    if (extIdx >= 0) {
      const ext = (row[extIdx] ?? '').trim();
      if (ext) byExternalId.set(ext, region);
    }
    if (nameIdx >= 0) {
      const nameKey = normalizeNameKey(row[nameIdx]);
      if (nameKey) byNormalizedName.set(nameKey, region);
    }
  }
}

/** Per-row overrides for batches without primary_district (crm_id → region). */
function applyManualCrmOverrides(byProspectId: Map<number, OregonCrmRegion>): void {
  const overrides: Readonly<Record<number, OregonCrmRegion>> = {
    // eastern-resort-20260825.csv
    683: 'Eastern Oregon', // Joseph Hardware
    684: 'Eastern Oregon', // Wallowa Lake Marina
    685: 'Eastern Oregon', // A Piece of Pendleton
    686: 'Oregon Coast', // Bandon Dunes
    687: 'Willamette Valley', // OGA Golf Woodburn
    // marine-sporting-20260825.csv
    680: 'Southern Oregon', // Waldron's Roseburg
    681: 'Southern Oregon', // Bradbury's Grants Pass
    682: 'Southern Oregon', // U Save Grants Pass
    // travel-oregon-priority (city-based; ids from import log)
    688: 'Portland Metro & Gorge', // Hood River
    689: 'Oregon Coast', // Lincoln City
    690: 'Oregon Coast', // Bandon
    691: 'Oregon Coast', // Brookings
    692: 'Southern Oregon', // Ashland
    693: 'Portland Metro & Gorge', // Government Camp
    694: 'Eastern Oregon', // Pendleton Hamley
    695: 'Portland Metro & Gorge', // Gorge Fly Shop Hood River
    696: 'Central Oregon', // Sunriver
    697: 'Southern Oregon', // Grants Pass
    698: 'Oregon Coast', // Cannon Beach
    699: 'Oregon Coast', // Seaside
    700: 'Oregon Coast', // Cannon Beach Cleanline
  };
  for (const [id, region] of Object.entries(overrides)) {
    byProspectId.set(Number(id), region);
  }
}

let cached: OregonImportRegionOverlay | null = null;

/** Load import CSV overlay maps (cached). Safe in Node scripts only. */
export function loadOregonImportRegionOverlay(): OregonImportRegionOverlay {
  if (cached) return cached;

  const byProspectId = new Map<number, OregonCrmRegion>();
  const byExternalId = new Map<string, OregonCrmRegion>();
  const byNormalizedName = new Map<string, OregonCrmRegion>();

  const files = [
    'oregon-big-wheel-lookalike-batch1.csv',
    'bandon-corridor-20260825.csv',
    'central-oregon-20260825.csv',
    'marine-sporting-20260825.csv',
    'eastern-resort-20260825.csv',
    'travel-oregon-priority-20260825.csv',
  ];

  for (const file of files) {
    loadCsvOverlayFile(file, byProspectId, byExternalId, byNormalizedName);
  }
  applyManualCrmOverrides(byProspectId);

  cached = { byProspectId, byExternalId, byNormalizedName };
  return cached;
}

/** Test helper: build overlay from in-memory maps. */
export function oregonImportOverlayFromMaps(
  byProspectId: Record<number, OregonCrmRegion> = {},
  byExternalId: Record<string, OregonCrmRegion> = {},
  byNormalizedName: Record<string, OregonCrmRegion> = {},
): OregonImportRegionOverlay {
  return {
    byProspectId: new Map(Object.entries(byProspectId).map(([k, v]) => [Number(k), v])),
    byExternalId: new Map(Object.entries(byExternalId)),
    byNormalizedName: new Map(Object.entries(byNormalizedName)),
  };
}
