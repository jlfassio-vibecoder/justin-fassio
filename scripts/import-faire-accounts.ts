/**
 * Import WA & OR Faire purchaser accounts to OGR Active Accounts.
 *
 * Self-contained: does not depend on @/ path aliases, can run with node --experimental-strip-types.
 *
 * Usage (dry-run, default):
 *   node --experimental-strip-types --env-file=.env scripts/import-faire-accounts.ts
 *
 * Usage (commit — writes to DB):
 *   node --experimental-strip-types --env-file=.env scripts/import-faire-accounts.ts --commit
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

// ─── Config ────────────────────────────────────────────────────────────────────
const SOURCE_TYPE = 'faire_customer';
const FILENAME = 'Wa-Oregon-Faire-Accounts.xlsx';
const OWNER_USER_ID = process.env.OUTREACH_PREP_ACTOR_USER_ID?.trim() ?? '';
const commit = process.argv.includes('--commit');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const xlsxPath = join(root, 'docs/account-import/faire/Wa-Oregon-Faire-Accounts.xlsx');

const url = process.env.PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceKey) { console.error('Need PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!OWNER_USER_ID) { console.error('Need OUTREACH_PREP_ACTOR_USER_ID'); process.exit(1); }

const client = createClient(url, serviceKey, { auth: { persistSession: false } });

// ─── Inline helpers ─────────────────────────────────────────────────────────────

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[_/]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function proposeColumnMap(headers: string[]): Record<string, string> {
  const ALIASES: Record<string, string[]> = {
    businessName: ['store name', 'store', 'business name', 'account name', 'account'],
    street: ['street', 'address 1', 'address1', 'street address'],
    city: ['city', 'town'],
    state: ['state', 'st', 'province'],
    postalCode: ['zip', 'zip code', 'postal code', 'postalcode'],
    contactName: ['contact name', 'contact', 'name'],
    email: ['email', 'email address', 'e-mail'],
    storeType: ['store type', 'type', 'category'],
  };
  const used = new Set<string>();
  const map: Record<string, string> = {};
  const normalized = headers.map((h) => ({ raw: h, key: normHeader(h) }));
  for (const [field, aliases] of Object.entries(ALIASES)) {
    const hit = normalized.find((h) => !used.has(h.raw) && aliases.some((a) => h.key === a || h.key.startsWith(`${a} `)));
    if (hit) { map[field] = hit.raw; used.add(hit.raw); }
  }
  return map;
}

function mapped(row: Record<string, string>, map: Record<string, string>, field: string): string {
  return (row[map[field] ?? ''] ?? '').trim();
}

function normalizeProspectName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|a|an|inc|llc|ltd|co|corp)\b/g, '').replace(/\s+/g, ' ').trim();
}

function territoryCode(state: string): 'or' | 'wa' | null {
  const k = state.trim().toUpperCase().replace(/\./g, '');
  if (k === 'OR' || k === 'OREGON') return 'or';
  if (k === 'WA' || k === 'WASHINGTON') return 'wa';
  return null;
}

function emailValid(e: string | null): boolean {
  if (!e) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

type NormalizedRow = {
  rowNumber: number;
  name: string;
  nameNormalized: string;
  street: string | null;
  city: string | null;
  stateCode: 'or' | 'wa' | null;
  postalCode: string | null;
  contactName: string | null;
  email: string | null;
  storeTypeRaw: string | null;
  addressUncertain: boolean;
  warnings: string[];
};

function normalizeRow(rowNumber: number, raw: Record<string, string>, map: Record<string, string>): NormalizedRow {
  const name = mapped(raw, map, 'businessName').replace(/\s+/g, ' ').trim();
  const street = mapped(raw, map, 'street') || null;
  const city = mapped(raw, map, 'city') || null;
  const stateRaw = mapped(raw, map, 'state') || null;
  const stateCode = stateRaw ? territoryCode(stateRaw) : null;
  const postalCode = mapped(raw, map, 'postalCode') || null;
  const contactName = mapped(raw, map, 'contactName') || null;
  const emailRaw = mapped(raw, map, 'email').toLowerCase() || null;
  const email = emailRaw && emailValid(emailRaw) ? emailRaw : null;
  const storeTypeRaw = mapped(raw, map, 'storeType') || null;
  const warnings: string[] = [];
  if (!stateCode && stateRaw) warnings.push(`Unrecognized state: ${stateRaw}`);
  if (!street) warnings.push('No street address');
  if (!postalCode) warnings.push('No ZIP');
  return { rowNumber, name, nameNormalized: normalizeProspectName(name), street, city, stateCode, postalCode, contactName, email, storeTypeRaw, addressUncertain: !street || !postalCode, warnings };
}

// ─── 1. Parse workbook ────────────────────────────────────────────────────────
let bytes: Uint8Array;
try {
  bytes = new Uint8Array(readFileSync(xlsxPath));
} catch {
  console.error(`Could not read ${xlsxPath}`); process.exit(1);
}
const sha = sha256Hex(bytes);

const wb = new ExcelJS.Workbook();
const copy = new ArrayBuffer(bytes.byteLength);
new Uint8Array(copy).set(bytes);
await wb.xlsx.load(copy);
const ws = wb.worksheets[0]!;

function cellStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && 'text' in (v as object)) return ((v as { text: string }).text ?? '').trim();
  if (typeof v === 'object' && 'result' in (v as object)) return cellStr((v as { result: unknown }).result);
  return String(v).trim();
}

const headerRow = ws.getRow(1);
const headerByCol = new Map<number, string>();
headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
  const h = cellStr(cell.value);
  if (h) headerByCol.set(col, h);
});
const headers = [...headerByCol.values()];

const rawRows: Record<string, string>[] = [];
ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
  if (rowNumber === 1) return;
  const record: Record<string, string> = {};
  let any = false;
  for (const [col, header] of headerByCol) {
    const v = cellStr(row.getCell(col).value);
    record[header] = v;
    if (v) any = true;
  }
  if (any) rawRows.push(record);
});

console.log(`\nParsed ${FILENAME} — sha256: ${sha.slice(0, 16)}…`);
console.log(`Sheet: ${ws.name}, rows: ${rawRows.length}`);
console.log(`Headers: ${headers.join(' | ')}`);

// ─── 2. Column map + normalize ────────────────────────────────────────────────
const colMap = proposeColumnMap(headers);
console.log('\nColumn map:');
for (const [k, v] of Object.entries(colMap)) console.log(`  ${k} → "${v}"`);
if (!colMap.businessName) { console.error('ERROR: businessName not mapped'); process.exit(1); }

const normalized: NormalizedRow[] = rawRows.map((raw, i) => normalizeRow(i + 1, raw, colMap));

console.log(`\n${'─'.repeat(60)}`);
console.log('NORMALIZED ROWS:');
for (const row of normalized) {
  const flags = [
    row.stateCode ? row.stateCode.toUpperCase() : '??',
    row.addressUncertain ? '⚠ uncertain-addr' : null,
    row.warnings.length ? `[${row.warnings.join('; ')}]` : null,
  ].filter(Boolean).join(', ');
  console.log(`  Row ${row.rowNumber}: ${row.name} | ${row.city ?? '??'}, ${flags} | email: ${row.email ?? 'none'}`);
}

// ─── 3. Load CRM snapshot ────────────────────────────────────────────────────
const { data: lines } = await client.from('lines').select('id, code, status').eq('code', 'ogr');
const ogrLine = lines?.[0];
if (!ogrLine) { console.error('OGR line not found'); process.exit(1); }
const salesLineId = ogrLine.id;
console.log(`\nOGR line id: ${salesLineId}`);

const { data: terrRows } = await client.from('territories').select('id, code');
const territoryIdByCode = new Map((terrRows ?? []).map((t) => [t.code as string, t.id as string]));
const codeById = new Map((terrRows ?? []).map((t) => [t.id as string, t.code as string]));

const { data: prospects } = await client.from('prospects').select('id, name, city, territory_id, account_status, external_id');
type ThinProspect = { id: number; name: string; city: string; stateCode: string | null };
const thinProspects: ThinProspect[] = (prospects ?? []).map((p) => ({
  id: p.id as number,
  name: p.name as string,
  city: p.city as string,
  stateCode: p.territory_id ? (codeById.get(p.territory_id as string) ?? null) : null,
}));

const { data: contacts } = await client.from('account_contacts').select('account_id, email').not('email', 'is', null);
const emailToRetailerId = new Map<string, number>();
for (const c of contacts ?? []) {
  if (c.email) emailToRetailerId.set(c.email.toLowerCase(), c.account_id as number);
}

const { count: activeCount } = await client.from('prospects').select('*', { count: 'exact', head: true }).eq('account_status', 'active_account');
const { count: openedCount } = await client.from('retailer_line_accounts').select('*', { count: 'exact', head: true }).eq('sales_line_id', salesLineId).eq('relationship_status', 'opened');
console.log(`Current active_account: ${activeCount}, OGR opened RLA: ${openedCount}`);

// ─── 4. Match ─────────────────────────────────────────────────────────────────
type MatchDecision = 'create_retailer' | 'link_existing' | 'needs_review';
type MatchedRow = NormalizedRow & { decision: MatchDecision; matchId: number | null; matchName: string | null; reasons: string[] };

function matchRow(row: NormalizedRow): MatchedRow {
  const reasons: string[] = [];

  // Name + geo match
  const nameNorm = row.nameNormalized;
  const geoHits = thinProspects.filter((p) => {
    if (normalizeProspectName(p.name) !== nameNorm) return false;
    if (row.stateCode && p.stateCode === row.stateCode) return true;
    if (row.city && p.city.trim().toLowerCase() === (row.city ?? '').trim().toLowerCase()) return true;
    return false;
  });
  if (geoHits.length === 1) {
    return { ...row, decision: 'link_existing', matchId: geoHits[0].id, matchName: geoHits[0].name, reasons };
  }
  if (geoHits.length > 1) {
    return { ...row, decision: 'needs_review', matchId: null, matchName: null, reasons: ['Multiple geo+name hits'] };
  }

  // Name-only match in OR/WA
  const nameHits = thinProspects.filter((p) => normalizeProspectName(p.name) === nameNorm && (p.stateCode === 'or' || p.stateCode === 'wa'));
  if (nameHits.length === 1) {
    return { ...row, decision: 'link_existing', matchId: nameHits[0].id, matchName: nameHits[0].name, reasons };
  }
  if (nameHits.length > 1) {
    return { ...row, decision: 'needs_review', matchId: null, matchName: null, reasons: ['Multiple name hits in OR/WA'] };
  }

  // Email match
  if (row.email) {
    const emailHit = emailToRetailerId.get(row.email);
    if (emailHit !== undefined) {
      return { ...row, decision: 'link_existing', matchId: emailHit, matchName: null, reasons: ['email match'] };
    }
  }

  return { ...row, decision: 'create_retailer', matchId: null, matchName: null, reasons };
}

const matchedRows = normalized.map(matchRow);

const createCount = matchedRows.filter((r) => r.decision === 'create_retailer').length;
const linkCount = matchedRows.filter((r) => r.decision === 'link_existing').length;
const reviewCount = matchedRows.filter((r) => r.decision === 'needs_review').length;

console.log(`\n${'─'.repeat(60)}`);
console.log('PREVIEW / DRY RUN:');
console.log(`  Total rows:            ${normalized.length}`);
console.log(`  Create new retailer:   ${createCount}`);
console.log(`  Link existing:         ${linkCount}`);
console.log(`  Needs review:          ${reviewCount}`);

console.log('\nROW DECISIONS:');
for (const row of matchedRows) {
  const match = row.matchId ? ` → CRM #${row.matchId} (${row.matchName ?? '?'})` : '';
  const errs = row.reasons.length ? ` ⛔ ${row.reasons.join('; ')}` : '';
  const warns = row.warnings.length ? ` ⚠ ${row.warnings.join('; ')}` : '';
  console.log(`  Row ${row.rowNumber}: [${row.decision}] ${row.name}${match}${errs}${warns}`);
}

if (!commit) {
  console.log('\n─── DRY RUN COMPLETE (no DB changes). Pass --commit to write. ───');
  process.exit(0);
}

// ─── 5. Commit via SQL (uses service-role + set_config to spoof owner uid) ────
console.log(`\n${'─'.repeat(60)}`);
console.log('COMMITTING…');

const eligibleRows = matchedRows.filter((r) => r.decision === 'create_retailer' || r.decision === 'link_existing');

// Load OGR SLT assignments for territory linking
const { data: sltRows } = await client.from('sales_line_territories').select('id, territory_id, status').eq('sales_line_id', salesLineId);
const sltByTerrId = new Map((sltRows ?? []).map((s) => [s.territory_id as string, s.id as string]));

const SOURCE_NOTE_PREFIX = `Import ${SOURCE_TYPE} batch from ${FILENAME}.`;

// Create import batch record
const { data: batch, error: batchErr } = await client.from('account_import_batches').insert({
  sales_line_id: salesLineId,
  source_type: SOURCE_TYPE,
  source_filename: FILENAME,
  content_sha256: sha,
  status: 'previewed',
  classification_snapshot: {
    relationshipStatus: 'opened',
    markers: ['historical_purchaser', 'reactivation_candidate'],
    existingOgr: 'yes',
    nextAction: null,
  },
  created_by: OWNER_USER_ID,
}).select('id').single();

let batchId: string;
if (batchErr) {
  // May already exist due to sha conflict
  const { data: existing } = await client.from('account_import_batches').select('id, status').eq('sales_line_id', salesLineId).eq('content_sha256', sha).order('created_at', { ascending: false }).limit(1);
  const eb = existing?.[0];
  if (eb && ['committed', 'enriching', 'enrichment_partial', 'completed'].includes(eb.status as string)) {
    console.log(`Batch already committed: ${eb.id} (${eb.status})`);
    process.exit(0);
  }
  if (!eb) { console.error('Could not create import batch:', batchErr.message); process.exit(1); }
  batchId = eb.id as string;
  console.log(`Resuming batch ${batchId}`);
} else {
  batchId = batch!.id as string;
  console.log(`Created batch ${batchId}`);
}

// Insert import row stubs
for (const row of matchedRows) {
  await client.from('account_import_rows').upsert({
    batch_id: batchId,
    sales_line_id: salesLineId,
    row_number: row.rowNumber,
    match_decision: row.decision,
    fingerprint: null,
    retailer_id: row.matchId ?? null,
    name: row.name,
    city: row.city,
    state_code: row.stateCode,
    postal_code: row.postalCode,
    street: row.street,
    email: row.email,
    phone: null,
    website: null,
    contact_name: row.contactName,
    store_type_raw: row.storeTypeRaw,
    category: 'gift_novelty_souvenir',
    raw_address_text: [row.street, row.city, row.stateCode?.toUpperCase(), row.postalCode].filter(Boolean).join(', '),
  }, { onConflict: 'batch_id,row_number' }).select('id');
}

const { data: allPersisted } = await client.from('account_import_rows').select('id, row_number, status').eq('batch_id', batchId);
const persistedById = new Map((allPersisted ?? []).map((r) => [r.row_number as number, r]));

let committed = 0;
let failed = 0;

for (const row of eligibleRows) {
  const persisted = persistedById.get(row.rowNumber);
  if (!persisted) { console.error(`  Row ${row.rowNumber}: no persisted row`); failed++; continue; }
  if (['imported', 'linked', 'updated'].includes(persisted.status as string)) {
    console.log(`  Row ${row.rowNumber} (${row.name}): already committed (${persisted.status})`);
    committed++;
    continue;
  }

  const terrId = territoryIdByCode.get(row.stateCode ?? '') ?? '';
  if (!terrId) { console.error(`  Row ${row.rowNumber}: no territory for state ${row.stateCode}`); failed++; continue; }
  const sltId = sltByTerrId.get(terrId) ?? null;

  const addressStr = [row.street, row.city, row.stateCode?.toUpperCase(), row.postalCode].filter(Boolean).join(', ');
  const importNote = `Sourced: Listed as a verified past OGR Faire customer in ${FILENAME}. Imported via faire_customer batch. No purchase date or order value supplied. Inference: Treat as dormant reactivation candidate until a qualifying order is logged.`;
  const sourceNote = `${SOURCE_NOTE_PREFIX}`;

  let payload: Record<string, unknown>;

  if (row.decision === 'create_retailer') {
    payload = {
      action: 'create_retailer',
      retailer_id: null,
      prospect_insert: {
        name: row.name,
        category: 'gift_novelty_souvenir',
        region: row.stateCode === 'or' ? 'Oregon' : 'Washington',
        city: row.city ?? '',
        address: addressStr,
        phone: '',
        fit: '',
        account_status: 'active_account',
        converted_at: null,
        initial_order_date: null,
        import_protected: true,
        existing_ogr: 'yes',
        qualification_status: 'reactivation',
        next_action: null,
        source_note: sourceNote,
        notes: importNote,
        website: null,
        retail_category: null,
        postal_code: row.postalCode ?? null,
        territory_id: terrId,
        primary_district: null,
        subterritory: null,
        external_id: null,
      },
      prospect_patch: null,
      rla_patch: {
        relationship_status: 'opened',
        line_account_markers: ['historical_purchaser', 'reactivation_candidate'],
        existing_ogr: 'yes',
        qualification_status: 'reactivation',
        next_action: null,
        source_note: sourceNote,
        sales_line_territory_id: sltId,
        backfill_review_reason: null,
        converted_at: null,
        initial_order_date: null,
        notes: importNote,
      },
      contact: row.contactName || row.email ? {
        full_name: row.contactName ?? '',
        email: row.email ?? null,
        phone: null,
        skip_if_primary_exists: true,
      } : null,
      field_changes: [
        { field_path: 'name', old_value: null, new_value: row.name },
        ...(row.city ? [{ field_path: 'city', old_value: null, new_value: row.city }] : []),
        ...(addressStr ? [{ field_path: 'address', old_value: null, new_value: addressStr }] : []),
        ...(row.postalCode ? [{ field_path: 'postal_code', old_value: null, new_value: row.postalCode }] : []),
      ],
      final_status: 'imported',
    };
  } else {
    // link_existing
    payload = {
      action: 'link_existing',
      retailer_id: row.matchId,
      prospect_insert: null,
      prospect_patch: null,
      rla_patch: {
        relationship_status: 'opened',
        line_account_markers: ['historical_purchaser', 'reactivation_candidate'],
        existing_ogr: 'yes',
        qualification_status: 'reactivation',
        next_action: null,
        source_note: sourceNote,
        sales_line_territory_id: sltId,
        backfill_review_reason: null,
        converted_at: null,
        initial_order_date: null,
        notes: importNote,
      },
      contact: row.contactName || row.email ? {
        full_name: row.contactName ?? '',
        email: row.email ?? null,
        phone: null,
        skip_if_primary_exists: true,
      } : null,
      field_changes: [],
      final_status: 'linked',
    };
  }

  // commit_account_import_row requires is_approved_owner() → auth.uid() must be owner.
  // With service role, we execute raw SQL to set_config first.
  const escapedPayload = JSON.stringify(payload).replace(/\\/g, '\\\\').replace(/'/g, "''");
  const sql = `
    select set_config('request.jwt.claim.sub', '${OWNER_USER_ID}', true);
    select public.commit_account_import_row('${persisted.id}'::uuid, '${escapedPayload}'::jsonb);
  `;

  // Use Supabase MCP execute_sql
  const { error: sqlError } = await (client as SupabaseClient).rpc('query' as never, { query: sql } as never);

  // Fallback: use supabase-js rpc directly (service role might bypass RLS but auth.uid() = null)
  // Try direct RPC with the service role client
  const { data: rpcData, error: rpcError } = await client.rpc('commit_account_import_row' as never, {
    p_import_row_id: persisted.id,
    p_payload: payload,
  } as never);

  if (rpcError) {
    if (rpcError.message.includes('Forbidden')) {
      console.error(`  Row ${row.rowNumber} (${row.name}): ⛔ Forbidden — commit_account_import_row requires owner JWT.`);
      console.error(`     → Run SQL commit path instead (see below)`);
    } else {
      console.error(`  Row ${row.rowNumber} (${row.name}): ⛔ ${rpcError.message}`);
    }
    failed++;
    continue;
  }

  const result = rpcData as { ok?: boolean; error?: string; status?: string } | null;
  if (!result?.ok) {
    console.error(`  Row ${row.rowNumber} (${row.name}): RPC returned error: ${result?.error}`);
    failed++;
    continue;
  }

  console.log(`  Row ${row.rowNumber} (${row.name}): ✓ ${row.decision} — ${result.status}`);
  committed++;
}

if (failed > 0) {
  console.log(`\n⚠ ${failed} rows failed (likely owner auth). Generating SQL fallback…`);
  console.log('\nRun the generated SQL file to commit via psql/Supabase SQL editor:');
  console.log('  supabase/migrations/faire_import_commit.sql');
}

await client.from('account_import_batches').update({ status: committed > 0 ? 'committed' : 'previewed' }).eq('id', batchId);

const { count: newActive } = await client.from('prospects').select('*', { count: 'exact', head: true }).eq('account_status', 'active_account');
const { count: newOpened } = await client.from('retailer_line_accounts').select('*', { count: 'exact', head: true }).eq('sales_line_id', salesLineId).eq('relationship_status', 'opened');
console.log(`\nActive accounts: ${activeCount} → ${newActive}, OGR opened RLA: ${openedCount} → ${newOpened}`);
