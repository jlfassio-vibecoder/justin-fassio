/**
 * Apply Oregon coastal golf-course prep sheet: enrich existing matches, create
 * missing courses with verified address/city/ZIP (no name-only inserts).
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/apply-oregon-coastal-golf-courses.ts
 *   npx tsx --env-file=.env scripts/apply-oregon-coastal-golf-courses.ts --apply
 *   npx tsx --env-file=.env scripts/apply-oregon-coastal-golf-courses.ts path/to/prep.csv [--apply]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { mapContactRole } from '../src/lib/contactResearch/mapContactRole.ts';
import { normalizeProspectName } from '../src/lib/prospectListImport.ts';
import { insertRetailerFieldChanges } from '../src/lib/retailerFieldChanges.ts';

const BATCH_TAG = 'Oregon coastal golf courses 2026-08-30';
const EXTERNAL_PREFIX = 'or-golf-20260830';
const PROVIDER = 'oregon_coastal_golf_courses';
const DEFAULT_PREP = 'docs/prospect-uploads/oregon/oregon-coastal-golf-courses-prep-20260830.csv';

/** Hard aliases when prep crm_match_id is empty but name still matches known CRM rows. */
const NAME_ALIAS_TO_ID: Record<string, number> = {
  'bandon dunes golf resort': 686,
  'bandon dunes golf resort (pro shop)': 686,
  'chinook winds golf resort': 741,
  'chinook winds casino resort': 741,
  'gearhart golf links': 787,
  'highlands golf club': 788,
  'discount dans golf / highlands golf club': 788,
  'astoria golf & country club': 792,
  'astoria golf': 792,
};

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
  course: string;
  crmMatchId: number | null;
  city: string;
  address: string;
  postalCode: string;
  website: string | null;
  contactName: string | null;
  contactRole: string | null;
  email: string | null;
  shopPhone: string | null;
  contactPhone: string | null;
  contactQuality: string;
  setGolfRetail: boolean;
  sourceNote: string;
};

type ProspectRow = {
  id: number;
  name: string;
  city: string | null;
  region: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  postal_code: string | null;
  category: string | null;
  buyer_verified: boolean;
  import_protected: boolean;
  verification_status: string | null;
  external_id: string | null;
  source_note: string | null;
  account_status: string | null;
  operational_territory_id: string | null;
};

type ContactLite = {
  id: string;
  fullName: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  notes: string | null;
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
  if (!v || v === '—' || v === '-') return null;
  if (/^no verified/i.test(v)) return null;
  if (/^buyer not publicly resolved$/i.test(v)) return null;
  return v;
}

function cleanEmail(value: string | null | undefined): string | null {
  const raw = clean(value);
  if (!raw || !raw.includes('@')) return null;
  const token = raw.split(/[\s,;]+/).find((t) => t.includes('@'));
  if (!token) return null;
  return token
    .replace(/^mailto:/i, '')
    .trim()
    .toLowerCase();
}

function cleanWebsite(value: string | null | undefined): string | null {
  const v = clean(value);
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^www\./i.test(v) || v.includes('.')) return `https://${v.replace(/^\/\//, '')}`;
  return null;
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
  // Keep extension forms like 541-997-1940 x7
  const m = v.match(/(\d{3})\D*(\d{3})\D*(\d{4})/);
  if (m) {
    const base = `${m[1]}-${m[2]}-${m[3]}`;
    const ext = v.match(/x\s*\d+/i)?.[0];
    return ext ? `${base} ${ext.replace(/\s+/g, '')}` : base;
  }
  return v;
}

function normalizeMatchName(name: string): string {
  return normalizeProspectName(name.replace(/^\d+\s+/, ''));
}

function compactNameKey(name: string): string {
  return normalizeMatchName(name).replace(/\s+/g, '');
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
      course: (cols[idx('course')] ?? '').trim(),
      crmMatchId: Number.isFinite(matchId) && matchId! > 0 ? matchId : null,
      city: (cols[idx('city')] ?? '').trim(),
      address: (cols[idx('address')] ?? '').trim(),
      postalCode: (cols[idx('postal_code')] ?? '').trim(),
      website: cleanWebsite(cols[idx('website')]),
      contactName: clean(cols[idx('contact_name')]),
      contactRole: clean(cols[idx('contact_role')]),
      email: cleanEmail(cols[idx('email')]),
      shopPhone: normalizePhone(cols[idx('shop_phone')]),
      contactPhone: normalizePhone(cols[idx('contact_phone')]),
      contactQuality: (cols[idx('contact_quality')] ?? '').trim(),
      setGolfRetail: /^(true|1|yes)$/i.test((cols[idx('set_golf_retail')] ?? '').trim()),
      sourceNote: (cols[idx('source_note')] ?? '').trim(),
    });
  }
  return rows.filter((r) => r.course.length > 0);
}

function hasVerifiedGeo(row: PrepRow): boolean {
  return Boolean(row.city && row.address && row.postalCode);
}

function isFalsePositiveContainment(sheetName: string, prospectName: string): boolean {
  const sheet = compactNameKey(sheetName);
  const prospect = compactNameKey(prospectName);
  // "Mook" / "The Mook…" must not match "Tillamook" (compact "tillamook" contains "mook").
  if (
    sheet.includes('mook') &&
    !sheet.includes('tillamook') &&
    (prospect.includes('tillamook') || /tillamook/i.test(prospectName))
  ) {
    return true;
  }
  return false;
}

function matchProspect(
  sheet: PrepRow,
  prospects: ProspectRow[],
  byId: Map<number, ProspectRow>,
):
  | { kind: 'match'; prospect: ProspectRow }
  | { kind: 'ambiguous'; candidates: ProspectRow[] }
  | null {
  if (sheet.crmMatchId != null) {
    const forced = byId.get(sheet.crmMatchId);
    if (forced) return { kind: 'match', prospect: forced };
  }

  const aliasId = NAME_ALIAS_TO_ID[normalizeMatchName(sheet.course)];
  if (aliasId != null) {
    const aliased = byId.get(aliasId);
    if (aliased) return { kind: 'match', prospect: aliased };
  }

  const sheetNorm = normalizeMatchName(sheet.course);
  const sheetCompact = compactNameKey(sheet.course);
  const sheetCity = normalizeProspectName(sheet.city);

  const exact = prospects.filter(
    (p) =>
      !isFalsePositiveContainment(sheet.course, p.name) &&
      (normalizeMatchName(p.name) === sheetNorm || compactNameKey(p.name) === sheetCompact),
  );
  if (exact.length === 1) return { kind: 'match', prospect: exact[0]! };
  if (exact.length > 1) {
    const byCity = exact.filter((p) => normalizeProspectName(p.city ?? '') === sheetCity);
    if (byCity.length === 1) return { kind: 'match', prospect: byCity[0]! };
    return { kind: 'ambiguous', candidates: byCity.length > 0 ? byCity : exact };
  }

  const contained = prospects.filter((p) => {
    if (isFalsePositiveContainment(sheet.course, p.name)) return false;
    const pn = normalizeMatchName(p.name);
    const pc = compactNameKey(p.name);
    return (
      (pn.length >= 6 && (pn.includes(sheetNorm) || sheetNorm.includes(pn))) ||
      (pc.length >= 6 && (pc.includes(sheetCompact) || sheetCompact.includes(pc)))
    );
  });
  if (contained.length === 1) return { kind: 'match', prospect: contained[0]! };
  if (contained.length > 1) {
    const byCity = contained.filter((p) => normalizeProspectName(p.city ?? '') === sheetCity);
    if (byCity.length === 1) return { kind: 'match', prospect: byCity[0]! };
    return { kind: 'ambiguous', candidates: byCity.length > 0 ? byCity : contained };
  }
  return null;
}

function classifyContactDuplicate(
  contacts: readonly ContactLite[],
  input: { fullName: string; email?: string | null },
): { kind: 'email' | 'name'; contact: ContactLite } | null {
  const emailNorm = (input.email ?? '').trim().toLowerCase();
  if (emailNorm) {
    const byEmail = contacts.find((c) => (c.email ?? '').trim().toLowerCase() === emailNorm);
    if (byEmail) return { kind: 'email', contact: byEmail };
  }
  const name = (input.fullName ?? '').trim().toLowerCase();
  if (!name) return null;
  const byName = contacts.find((c) => (c.fullName ?? '').trim().toLowerCase() === name);
  if (byName) return { kind: 'name', contact: byName };
  return null;
}

function contactNotes(row: PrepRow): string | null {
  const parts = [
    row.contactQuality ? `Contact quality: ${row.contactQuality}` : '',
    row.contactRole ? `Role evidence: ${row.contactRole}` : '',
    row.sourceNote || '',
    BATCH_TAG,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join('\n') : null;
}

function prospectFieldValue(prospect: ProspectRow, fieldPath: string): unknown {
  switch (fieldPath) {
    case 'postal_code':
      return prospect.postal_code ?? null;
    case 'phone':
      return prospect.phone ?? null;
    case 'website':
      return prospect.website ?? null;
    case 'address':
      return prospect.address ?? null;
    case 'city':
      return prospect.city ?? null;
    case 'category':
      return prospect.category ?? null;
    case 'source_note':
      return prospect.source_note ?? null;
    case 'operational_territory_id':
      return prospect.operational_territory_id ?? null;
    default:
      return null;
  }
}

function buildSourceNote(row: PrepRow, existing: string | null): string {
  const parts = [
    existing?.trim() || null,
    BATCH_TAG,
    row.contactQuality ? `Golf contact research: ${row.contactQuality}` : null,
    row.sourceNote || null,
  ].filter(Boolean);
  return parts.join('\n\n');
}

async function upsertContact(prospectId: number, row: PrepRow, report: string[]): Promise<void> {
  if (!row.contactName && !row.email) return;

  const { data: existingContacts, error: contactListErr } = await client
    .from('account_contacts')
    .select('id, account_id, role, full_name, title, phone, email, is_primary, notes')
    .eq('account_id', prospectId);

  if (contactListErr) {
    report.push(`  ERROR contacts ${prospectId}: ${contactListErr.message}`);
    return;
  }

  const contacts: ContactLite[] = (existingContacts ?? []).map((c) => ({
    id: c.id,
    fullName: c.full_name,
    title: c.title,
    phone: c.phone,
    email: c.email,
    isPrimary: c.is_primary,
    notes: c.notes,
  }));

  const fullName = row.contactName;
  const email = row.email;
  const phone = row.contactPhone ?? row.shopPhone;
  const title = row.contactRole;
  const notes = contactNotes(row);
  const role = mapContactRole(row.contactRole ?? '');

  const dup = fullName
    ? classifyContactDuplicate(contacts, { fullName, email })
    : email
      ? classifyContactDuplicate(contacts, {
          fullName: email.split('@')[0] ?? email,
          email,
        })
      : null;

  if (dup?.contact) {
    const patch: Record<string, unknown> = {};
    if (dup.kind === 'name' && email && !(dup.contact.email ?? '').trim()) patch.email = email;
    // Replace email-local-part placeholders when research has a real person name.
    if (
      fullName &&
      dup.kind === 'email' &&
      email &&
      (dup.contact.fullName ?? '').trim().toLowerCase() ===
        (email.split('@')[0] ?? '').trim().toLowerCase()
    ) {
      patch.full_name = fullName;
    }
    if (title && !(dup.contact.title ?? '').trim()) patch.title = title;
    if (phone && !(dup.contact.phone ?? '').trim()) patch.phone = phone;
    if (notes) patch.notes = [dup.contact.notes, notes].filter(Boolean).join('\n\n');
    if (Object.keys(patch).length > 0) {
      const { error } = await client
        .from('account_contacts')
        .update(patch)
        .eq('id', dup.contact.id);
      if (error) report.push(`  ERROR update contact ${dup.contact.id}: ${error.message}`);
      else report.push(`  UPDATED contact ${dup.contact.id} (${dup.kind} match)`);
    } else {
      report.push(`  CONTACT unchanged ${dup.contact.id}`);
    }
    return;
  }

  const hasPrimary = contacts.some((c) => c.isPrimary);
  const makePrimary = !hasPrimary;
  const { error: insErr } = await client.from('account_contacts').insert({
    account_id: prospectId,
    role,
    full_name: fullName ?? email?.split('@')[0] ?? 'Contact',
    title,
    phone: phone ?? null,
    email,
    is_primary: makePrimary,
    notes,
  });
  if (insErr) report.push(`  ERROR insert contact ${prospectId}: ${insErr.message}`);
  else report.push(`  INSERTED contact for ${prospectId}`);
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
    'id, name, city, region, phone, website, address, postal_code, category, buyer_verified, import_protected, verification_status, external_id, source_note, account_status, operational_territory_id',
  )
  .or('region.eq.Oregon Coast,region.eq.Oregon')
  .order('id');

if (prospectErr) {
  console.error(prospectErr.message);
  process.exit(1);
}

const pool = (prospects ?? []) as ProspectRow[];
const byId = new Map(pool.map((p) => [p.id, p]));

// Ensure forced-match IDs are loadable even if region filter missed them.
const forcedIds = [
  ...new Set([
    ...prepRows.map((r) => r.crmMatchId).filter((id): id is number => id != null),
    ...Object.values(NAME_ALIAS_TO_ID),
  ]),
];
for (const id of forcedIds) {
  if (byId.has(id)) continue;
  const { data: extra, error } = await client
    .from('prospects')
    .select(
      'id, name, city, region, phone, website, address, postal_code, category, buyer_verified, import_protected, verification_status, external_id, source_note, account_status',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error(`Failed loading prospect ${id}: ${error.message}`);
    process.exit(1);
  }
  if (extra) {
    pool.push(extra as ProspectRow);
    byId.set(extra.id, extra as ProspectRow);
  }
}

const matchedIds = new Set<number>();
const report: string[] = [];
let enrichCount = 0;
let createCount = 0;
let needsAddressCount = 0;
let ambiguousCount = 0;

for (const row of prepRows) {
  const hit = matchProspect(
    row,
    pool.filter((p) => !matchedIds.has(p.id)),
    byId,
  );

  if (hit?.kind === 'ambiguous') {
    ambiguousCount += 1;
    report.push(
      `AMBIGUOUS\t${row.course}\t${hit.candidates.map((c) => `${c.id}:${c.name}`).join(' | ')}`,
    );
    continue;
  }

  if (hit?.kind === 'match') {
    const prospect = hit.prospect;
    matchedIds.add(prospect.id);
    enrichCount += 1;

    const prospectPatch: Record<string, string> = {};
    if (row.shopPhone) {
      const existing = normalizePhone(prospect.phone);
      if (!existing || existing !== row.shopPhone) {
        // Prefer shop/pro-shop number from golf research when empty or different.
        if (!(prospect.phone ?? '').trim() || existing !== row.shopPhone) {
          prospectPatch.phone = row.shopPhone;
        }
      }
    }
    if (row.website && !(prospect.website ?? '').trim()) prospectPatch.website = row.website;
    else if (row.website && (prospect.website ?? '').trim() !== row.website) {
      prospectPatch.website = row.website;
    }
    if (row.address && !(prospect.address ?? '').trim()) prospectPatch.address = row.address;
    if (row.postalCode && !(prospect.postal_code ?? '').trim()) {
      prospectPatch.postal_code = row.postalCode;
    }
    if (
      row.city &&
      normalizeProspectName(prospect.city ?? '') !== normalizeProspectName(row.city)
    ) {
      // Fill blank city; do not rename city on import_protected unless blank.
      if (!(prospect.city ?? '').trim() || !prospect.import_protected) {
        prospectPatch.city = row.city;
      }
    }
    if (row.setGolfRetail && prospect.category !== 'golf_retail') {
      prospectPatch.category = 'golf_retail';
    }
    if (!prospect.operational_territory_id) {
      prospectPatch.operational_territory_id = opsTerritory.id;
    }

    const note = buildSourceNote(row, prospect.source_note);
    if (note !== (prospect.source_note ?? '')) {
      prospectPatch.source_note = note;
    }

    report.push(
      `ENRICH\t${prospect.id}\t${prospect.name}\t<= ${row.course}\tphone=${prospectPatch.phone ?? '—'}\tweb=${prospectPatch.website ?? '—'}\tcity=${prospectPatch.city ?? '—'}\taddr=${prospectPatch.address ?? '—'}\tcat=${prospectPatch.category ?? '—'}\tcontact=${row.contactName ?? '—'}\temail=${row.email ?? '—'}`,
    );

    if (!apply) continue;

    if (Object.keys(prospectPatch).length > 0) {
      const { error: updErr } = await client
        .from('prospects')
        .update(prospectPatch)
        .eq('id', prospect.id);
      if (updErr) {
        report.push(`  ERROR prospect ${prospect.id}: ${updErr.message}`);
        continue;
      }
      const auditRows = Object.entries(prospectPatch).map(([fieldPath, newValue]) => ({
        retailerId: prospect.id,
        fieldPath,
        oldValue: prospectFieldValue(prospect, fieldPath),
        newValue,
        source: 'import' as const,
        provider: PROVIDER,
        confidence: row.contactQuality || null,
        sourceUrls: row.website ? [row.website] : [],
      }));
      await insertRetailerFieldChanges(client, auditRows);
      report.push(`  UPDATED prospect ${prospect.id}`);
    }

    await upsertContact(prospect.id, row, report);
    continue;
  }

  // No match — create only with verified geo
  if (!hasVerifiedGeo(row)) {
    needsAddressCount += 1;
    report.push(`NEEDS_ADDRESS\t${row.course}\t${row.city || '—'}`);
    continue;
  }

  createCount += 1;
  const externalId = `${EXTERNAL_PREFIX}-${externalIdSlug(row.course)}`;
  report.push(
    `CREATE\t${row.course}\t${row.city}\t${row.address}\t${row.postalCode}\t${externalId}\tcontact=${row.contactName ?? '—'}\temail=${row.email ?? '—'}`,
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
    name: row.course,
    category: 'golf_retail',
    region: 'Oregon Coast',
    city: row.city,
    address: row.address,
    postal_code: row.postalCode,
    phone: row.shopPhone ?? '',
    territory_id: territory.id,
    operational_territory_id: opsTerritory.id,
    primary_district: 'Oregon Coast',
    website: row.website,
    external_id: externalId,
    verification_status: 'unverified',
    source_note: buildSourceNote(row, null),
    next_action: 'Qualify coastal golf pro shop; confirm merchandise buyer',
  };

  const { data: inserted, error: insErr } = await client
    .from('prospects')
    .insert(insertPayload)
    .select('id')
    .maybeSingle();

  let insertedId: number;
  if (inserted?.id && !insErr) {
    insertedId = inserted.id;
  } else if (insErr?.message?.includes('duplicate') || insErr?.code === '23505') {
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
      report.push(
        `  ERROR insert ${row.course}: ${insErr2?.message ?? insErr?.message ?? 'no id'}`,
      );
      continue;
    }
    insertedId = inserted2.id;
  } else {
    report.push(`  ERROR insert ${row.course}: ${insErr?.message ?? 'no id'}`);
    continue;
  }

  matchedIds.add(insertedId);
  byId.set(insertedId, {
    id: insertedId,
    name: row.course,
    city: row.city,
    region: 'Oregon Coast',
    phone: row.shopPhone,
    website: row.website,
    address: row.address,
    postal_code: row.postalCode,
    category: 'golf_retail',
    buyer_verified: false,
    import_protected: false,
    verification_status: 'unverified',
    external_id: externalId,
    source_note: insertPayload.source_note,
    account_status: 'prospect',
    operational_territory_id: opsTerritory.id,
  });
  report.push(`  INSERTED prospect ${insertedId}`);
  await upsertContact(insertedId, row, report);
}

console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
console.log(`Prep file: ${csvPath}`);
console.log(
  `Rows: ${prepRows.length} · enrich: ${enrichCount} · create: ${createCount} · needs_address: ${needsAddressCount} · ambiguous: ${ambiguousCount}`,
);
console.log('---');
for (const line of report) console.log(line);
