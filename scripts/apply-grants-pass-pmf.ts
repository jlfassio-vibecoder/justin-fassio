/**
 * Apply Grants Pass PMF prospect list: enrich existing matches, create missing
 * Southern Oregon research prospects with contacts.
 *
 * Usage:
 *   node --experimental-strip-types --env-file=.env scripts/apply-grants-pass-pmf.ts
 *   node --experimental-strip-types --env-file=.env scripts/apply-grants-pass-pmf.ts --apply
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function normalizeProspectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|a|an|inc|llc|ltd|co|corp)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapContactRole(roleText: string | null | undefined): 'owner' | 'manager' | 'buyer' {
  const r = (roleText ?? '').toLowerCase();
  if (r.includes('owner') || r.includes('founder') || r.includes('president')) return 'owner';
  if (r.includes('buyer') || r.includes('purchasing')) return 'buyer';
  if (r.includes('manager') || r.includes('gm') || r.includes('general manager')) return 'manager';
  return 'buyer';
}

const BATCH_TAG = 'Grants Pass PMF contacts 2026-09-05';
const EXTERNAL_PREFIX = 'or-gp-20260905';
const DEFAULT_PREP = 'docs/prospect-uploads/oregon/grants-pass-pmf-20260905.csv';
const REGION = 'Southern Oregon';
const CITY = 'Grants Pass';

const apply = process.argv.includes('--apply');
const fileArg = process.argv.find((a) => !a.startsWith('-') && a.endsWith('.csv')) ?? DEFAULT_PREP;

const url = process.env.PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error('Need PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type PrepRow = {
  pmfRank: number;
  retailer: string;
  crmMatchId: number | null;
  category: string;
  contactName: string | null;
  contactTitle: string | null;
  phone: string | null;
  altPhone: string | null;
  email: string | null;
  contactConfidence: string | null;
  notes: string | null;
};

type ProspectRow = {
  id: number;
  name: string;
  city: string | null;
  region: string;
  phone: string | null;
  address: string | null;
  category: string | null;
  import_protected: boolean;
  external_id: string | null;
  source_note: string | null;
  account_status: string | null;
  operational_territory_id: string | null;
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function clean(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  return v ? v : null;
}

function cleanEmail(value: string | null | undefined): string | null {
  const raw = clean(value);
  if (!raw || !raw.includes('@')) return null;
  return raw
    .replace(/^mailto:/i, '')
    .trim()
    .toLowerCase();
}

function normalizePhone(value: string | null | undefined): string | null {
  const v = clean(value);
  if (!v) return null;
  const digits = v.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  // Incomplete like 541-479 — reject
  if (digits.length < 10) return null;
  return v;
}

function externalIdSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function loadPrepRows(csvPath: string): PrepRow[] {
  const text = readFileSync(csvPath, 'utf8');
  const lines = text.trim().split(/\r?\n/);
  const header = parseCsvLine(lines[0] ?? '');
  const idx = (name: string) => header.indexOf(name);
  const rows: PrepRow[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    const matchRaw = (cols[idx('crm_match_id')] ?? '').trim();
    const matchId = matchRaw ? Number(matchRaw) : null;
    rows.push({
      pmfRank: Number(cols[idx('pmf_rank')] ?? 0),
      retailer: (cols[idx('retailer')] ?? '').trim(),
      crmMatchId: Number.isFinite(matchId) && matchId! > 0 ? matchId : null,
      category: (cols[idx('category')] ?? 'other').trim() || 'other',
      contactName: clean(cols[idx('contact_name')]),
      contactTitle: clean(cols[idx('contact_title')]),
      phone: normalizePhone(cols[idx('phone')]),
      altPhone: normalizePhone(cols[idx('alt_phone')]),
      email: cleanEmail(cols[idx('email')]),
      contactConfidence: clean(cols[idx('contact_confidence')]),
      notes: clean(cols[idx('notes')]),
    });
  }
  return rows;
}

function buildSourceNote(row: PrepRow, existing: string | null): string {
  const parts = [
    existing?.trim() || null,
    BATCH_TAG,
    `PMF #${row.pmfRank}`,
    row.contactConfidence ? `Contact confidence: ${row.contactConfidence}` : null,
    row.notes,
  ].filter(Boolean);
  return [...new Set(parts)].join('. ');
}

function contactNotes(row: PrepRow): string | null {
  const parts = [
    row.contactConfidence ? `Confidence: ${row.contactConfidence}` : null,
    row.altPhone ? `Alt phone: ${row.altPhone}` : null,
    row.notes,
    BATCH_TAG,
  ].filter(Boolean);
  return parts.length ? parts.join(' | ') : null;
}

async function upsertContact(prospectId: number, row: PrepRow, report: string[]): Promise<void> {
  if (!row.contactName && !row.email) {
    report.push(`  CONTACT skipped (no name/email)`);
    return;
  }

  const { data: existing } = await client
    .from('account_contacts')
    .select('id, full_name, email, phone, is_primary, title, notes')
    .eq('account_id', prospectId);

  const contacts = existing ?? [];
  const role = mapContactRole(row.contactTitle);
  const fullName = row.contactName ?? row.email?.split('@')[0] ?? 'Contact';
  const email = row.email;
  const phone = row.altPhone ?? row.phone;
  const notes = contactNotes(row);

  const nameNorm = normalizeProspectName(fullName);
  const dup = contacts.find((c) => {
    if (email && c.email && c.email.toLowerCase() === email) return true;
    if (nameNorm && normalizeProspectName(c.full_name ?? '') === nameNorm) return true;
    return false;
  });

  if (dup) {
    const patch: Record<string, unknown> = {};
    if (row.contactTitle && !(dup.title ?? '').trim()) patch.title = row.contactTitle;
    if (phone && !(dup.phone ?? '').trim()) patch.phone = phone;
    if (email && !(dup.email ?? '').trim()) patch.email = email;
    if (notes) patch.notes = [dup.notes, notes].filter(Boolean).join('\n\n');
    if (Object.keys(patch).length > 0) {
      const { error } = await client.from('account_contacts').update(patch).eq('id', dup.id);
      if (error) report.push(`  ERROR update contact: ${error.message}`);
      else report.push(`  UPDATED contact ${dup.id} (${fullName})`);
    } else {
      report.push(`  CONTACT unchanged ${dup.id}`);
    }
    return;
  }

  const hasPrimary = contacts.some((c) => c.is_primary);
  const { error: insErr } = await client.from('account_contacts').insert({
    account_id: prospectId,
    role,
    full_name: fullName,
    title: row.contactTitle,
    phone: phone ?? null,
    email,
    is_primary: !hasPrimary,
    notes,
  });
  if (insErr) report.push(`  ERROR insert contact: ${insErr.message}`);
  else report.push(`  INSERTED contact ${fullName}`);
}

const csvPath = resolve(fileArg);
const prepRows = loadPrepRows(csvPath);

const { data: territory, error: terrErr } = await client
  .from('territories')
  .select('id, code')
  .eq('code', 'or')
  .maybeSingle();
if (terrErr || !territory?.id) {
  console.error(terrErr?.message ?? 'Oregon territory (code=or) not found');
  process.exit(1);
}

const { data: opsTerritory, error: opsTerrErr } = await client
  .from('territories')
  .select('id, code')
  .eq('code', 'pnw-west')
  .maybeSingle();
if (opsTerrErr || !opsTerritory?.id) {
  console.error(opsTerrErr?.message ?? 'Ops territory (code=pnw-west) not found');
  process.exit(1);
}

const { data: prospects, error: prospectErr } = await client
  .from('prospects')
  .select(
    'id, name, city, region, phone, address, category, import_protected, external_id, source_note, account_status, operational_territory_id',
  )
  .or(`city.ilike.%Grants Pass%,id.in.(681,697)`);

if (prospectErr) {
  console.error(prospectErr.message);
  process.exit(1);
}

const pool = (prospects ?? []) as ProspectRow[];
const byId = new Map(pool.map((p) => [p.id, p]));
const byNormName = new Map(pool.map((p) => [normalizeProspectName(p.name), p] as const));

const report: string[] = [];
let enrichCount = 0;
let createCount = 0;

for (const row of prepRows) {
  let prospect: ProspectRow | null = null;

  if (row.crmMatchId != null) {
    prospect = byId.get(row.crmMatchId) ?? null;
    if (!prospect) {
      const { data: extra } = await client
        .from('prospects')
        .select(
          'id, name, city, region, phone, address, category, import_protected, external_id, source_note, account_status, operational_territory_id',
        )
        .eq('id', row.crmMatchId)
        .maybeSingle();
      if (extra) {
        prospect = extra as ProspectRow;
        byId.set(prospect.id, prospect);
      }
    }
  }

  if (!prospect) {
    prospect = byNormName.get(normalizeProspectName(row.retailer)) ?? null;
  }

  if (prospect) {
    enrichCount += 1;
    const patch: Record<string, string> = {};
    if (row.phone && !(prospect.phone ?? '').trim()) patch.phone = row.phone;
    if (!prospect.operational_territory_id) {
      patch.operational_territory_id = opsTerritory.id;
    }
    if (prospect.region !== REGION && !prospect.import_protected) {
      patch.region = REGION;
    }
    const note = buildSourceNote(row, prospect.source_note);
    if (note !== (prospect.source_note ?? '')) patch.source_note = note;

    report.push(
      `ENRICH\t#${prospect.id}\t${prospect.name}\t<= PMF#${row.pmfRank} ${row.retailer}\tcontact=${row.contactName ?? '—'}\temail=${row.email ?? '—'}`,
    );

    if (apply) {
      if (Object.keys(patch).length > 0) {
        const { error } = await client.from('prospects').update(patch).eq('id', prospect.id);
        if (error) report.push(`  ERROR prospect ${prospect.id}: ${error.message}`);
        else report.push(`  UPDATED prospect ${prospect.id}`);
      }
      await upsertContact(prospect.id, row, report);
    }
    continue;
  }

  createCount += 1;
  const externalId = `${EXTERNAL_PREFIX}-${externalIdSlug(row.retailer)}`;
  report.push(
    `CREATE\tPMF#${row.pmfRank}\t${row.retailer}\t${externalId}\tphone=${row.phone ?? '—'}\tcontact=${row.contactName ?? '—'}\temail=${row.email ?? '—'}`,
  );

  if (!apply) continue;

  const { data: maxRow, error: maxErr } = await client
    .from('prospects')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) {
    report.push(`  ERROR allocate id: ${maxErr.message}`);
    continue;
  }

  const insertPayload = {
    id: (maxRow?.id ?? 0) + 1,
    name: row.retailer,
    category: row.category,
    region: REGION,
    city: CITY,
    address: '',
    phone: row.phone ?? '',
    territory_id: territory.id,
    operational_territory_id: opsTerritory.id,
    primary_district: REGION,
    external_id: externalId,
    verification_status: 'unverified',
    source_note: buildSourceNote(row, null),
    next_action: 'Qualify Grants Pass PMF prospect; confirm merchandise buyer',
  };

  const { data: inserted, error: insErr } = await client
    .from('prospects')
    .insert(insertPayload)
    .select('id')
    .maybeSingle();

  let insertedId: number | null = inserted?.id ?? null;
  if (!insertedId && (insErr?.message?.includes('duplicate') || insErr?.code === '23505')) {
    const { data: maxRow2 } = await client
      .from('prospects')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    const retryId = (maxRow2?.id ?? insertPayload.id) + 1;
    const { data: inserted2, error: insErr2 } = await client
      .from('prospects')
      .insert({ ...insertPayload, id: retryId })
      .select('id')
      .maybeSingle();
    if (insErr2 || !inserted2?.id) {
      report.push(`  ERROR insert: ${insErr2?.message ?? insErr?.message ?? 'no id'}`);
      continue;
    }
    insertedId = inserted2.id;
  }
  if (insertedId == null) {
    report.push(`  ERROR insert: ${insErr?.message ?? 'no id'}`);
    continue;
  }

  report.push(`  INSERTED prospect ${insertedId}`);
  byNormName.set(normalizeProspectName(row.retailer), {
    id: insertedId,
    name: row.retailer,
    city: CITY,
    region: REGION,
    phone: row.phone,
    address: '',
    category: row.category,
    import_protected: false,
    external_id: externalId,
    source_note: insertPayload.source_note,
    account_status: 'prospect',
    operational_territory_id: opsTerritory.id,
  });
  await upsertContact(insertedId, row, report);
}

console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
console.log(`Prep file: ${csvPath}`);
console.log(`Enrich existing: ${enrichCount}`);
console.log(`Create new: ${createCount}`);
console.log('');
for (const line of report) console.log(line);
