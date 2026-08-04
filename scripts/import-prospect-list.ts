/**
 * Import docs/prospect-list.html into a SQL migration (match existing, insert new).
 *
 * Usage (from repo root):
 *   node --experimental-strip-types scripts/import-prospect-list.ts --dry-run
 *   node --experimental-strip-types scripts/import-prospect-list.ts --sql
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildUpsertPlan,
  parseProspectListHtml,
  renderUpsertSql,
  type CrmProspectRef,
} from '../src/lib/prospectListImport';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = join(root, 'docs/prospect-list.html');
const seedPath = join(root, 'scripts/seed-source/prospects.ts');
const outPath = join(root, 'supabase/migrations/20260804120000_upsert_bc_prospect_list.sql');

function extractExportedArray(
  source: string,
  exportName: string,
): Array<{ id: number; name: string; city: string }> {
  const marker = `export const ${exportName}`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${exportName}`);
  const assign = source.indexOf('=', start);
  const bracket = source.indexOf('[', assign);
  let depth = 0;
  let end = -1;
  for (let i = bracket; i < source.length; i++) {
    const ch = source[i];
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) throw new Error(`Unclosed array for ${exportName}`);
  return new Function(`return (${source.slice(bracket, end)})`)() as Array<{
    id: number;
    name: string;
    city: string;
  }>;
}

function loadCrmFromSeed(): CrmProspectRef[] {
  const prospects = extractExportedArray(readFileSync(seedPath, 'utf8'), 'PROSPECTS_DATA');
  return prospects.map((p) => ({
    id: p.id,
    name: p.name,
    city: p.city,
    externalId: null,
  }));
}

const args = process.argv.slice(2);
const argSet = new Set(args);
const dryRun = argSet.has('--dry-run') || !argSet.has('--sql');
const writeSql = argSet.has('--sql');

function readFlag(name: string): string | null {
  const idx = args.indexOf(name);
  if (idx < 0 || idx + 1 >= args.length) return null;
  return args[idx + 1] ?? null;
}

const html = readFileSync(htmlPath, 'utf8');
const sheets = parseProspectListHtml(html);
const crm: CrmProspectRef[] = loadCrmFromSeed();

const extraCrmPath = readFlag('--crm-json');
if (extraCrmPath) {
  const extra = JSON.parse(readFileSync(extraCrmPath, 'utf8')) as CrmProspectRef[];
  const byId = new Map(crm.map((p) => [p.id, p]));
  for (const row of extra) byId.set(row.id, row);
  crm.length = 0;
  crm.push(...byId.values());
}

const plan = buildUpsertPlan(sheets, crm);

const matchedIds = new Set(plan.updates.map((u) => u.crmId));
const unmatchedSeed = crm.filter((p) => !matchedIds.has(p.id));

console.log(
  JSON.stringify(
    {
      sheetRows: sheets.length,
      crmRows: crm.length,
      updates: plan.updates.length,
      inserts: plan.inserts.length,
      ambiguous: plan.ambiguous.length,
      unmatchedSeed: unmatchedSeed.length,
      matchVia: plan.updates.reduce(
        (acc, u) => {
          acc[u.matchVia] = (acc[u.matchVia] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    },
    null,
    2,
  ),
);

if (plan.ambiguous.length > 0) {
  console.error('Ambiguous matches:');
  for (const a of plan.ambiguous) {
    console.error(
      `  ${a.sheet.externalId} ${a.sheet.name} @ ${a.sheet.city} →`,
      a.candidates.map((c) => `${c.id}:${c.name}`).join(', '),
    );
  }
  process.exit(1);
}

if (writeSql) {
  const nextIdFlag = readFlag('--next-id');
  const maxId = Math.max(...crm.map((p) => p.id), 0);
  const nextIdStart = nextIdFlag ? Number(nextIdFlag) : maxId + 1;
  if (!Number.isFinite(nextIdStart) || nextIdStart < 1) {
    throw new Error(`Invalid --next-id: ${nextIdFlag}`);
  }
  const sql = renderUpsertSql(plan, {
    nextIdStart,
    generatedBy: 'scripts/import-prospect-list.ts',
  });
  writeFileSync(outPath, sql);
  console.log(`Wrote ${outPath} (nextIdStart=${nextIdStart})`);
} else if (dryRun) {
  console.log('(dry-run) pass --sql to write the migration file');
}
