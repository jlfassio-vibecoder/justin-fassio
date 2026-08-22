#!/usr/bin/env node
/**
 * Build docs/territories/zip-to-county.json from Census ZCTA5–County relationship file.
 * JSON is the only checked-in representation (imported by deriveCountyFips.ts).
 *
 * Usage:
 *   node scripts/generate-zip-county-crosswalk.mjs /path/to/tab20_zcta520_county20_natl.txt
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/generate-zip-county-crosswalk.mjs <census-rel-file>');
  process.exit(1);
}

const text = readFileSync(src, 'utf8').replace(/^\uFEFF/, '');
const lines = text.split(/\r?\n/).slice(1);
const byZip = new Map();
for (const line of lines) {
  if (!line.trim()) continue;
  const cols = line.split('|');
  const zip = cols[1];
  const county = cols[9];
  if (!/^\d{5}$/.test(zip || '')) continue;
  if (!/^(06|41|53)\d{3}$/.test(county || '')) continue;
  if (!byZip.has(zip)) byZip.set(zip, new Set());
  byZip.get(zip).add(county);
}

const stateOf = (fips) => (fips.startsWith('06') ? 'CA' : fips.startsWith('41') ? 'OR' : 'WA');

const rows = [...byZip.entries()]
  .map(([zip, set]) => {
    const counties = [...set].sort();
    const states = [...new Set(counties.map(stateOf))];
    return {
      zip,
      state_code: states.length === 1 ? states[0] : states.sort().join('|'),
      county_fips: counties,
    };
  })
  .sort((a, b) => a.zip.localeCompare(b.zip));

const artifact = {
  source: 'US Census 2020 ZCTA5–County relationship file (tab20_zcta520_county20_natl)',
  effective_date: '2026-08-22',
  description:
    'ZIP → all intersecting county FIPS for WA/OR/CA. Multi-county ZIPs list every county; suggestion uses consensus, never highest ratio.',
  zips: rows,
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = resolve(root, 'docs/territories/zip-to-county.json');
// Compact: one ZIP object per line keeps the file reviewable without a 20k-line pretty dump.
const body = artifact.zips.map((row) => JSON.stringify(row)).join(',\n    ');
const json = `{
  "source": ${JSON.stringify(artifact.source)},
  "effective_date": ${JSON.stringify(artifact.effective_date)},
  "description": ${JSON.stringify(artifact.description)},
  "zips": [
    ${body}
  ]
}
`;
writeFileSync(outPath, json);
console.log(
  `Wrote ${rows.length} ZIP rows to docs/territories/zip-to-county.json (${rows.filter((r) => r.county_fips.length > 1).length} multi-county)`,
);
