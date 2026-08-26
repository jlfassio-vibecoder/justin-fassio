/**
 * Apply Oregon Coast contact enrichment spreadsheet to existing CRM prospects.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/apply-oregon-coast-contact-enrichment.ts /path/to/file.xlsx
 *   npx tsx --env-file=.env scripts/apply-oregon-coast-contact-enrichment.ts /path/to/file.xlsx --apply
 */
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { normalizeProspectName } from '../src/lib/prospectListImport.ts';
import { insertRetailerFieldChanges } from '../src/lib/retailerFieldChanges.ts';

const apply = process.argv.includes('--apply');
const fileArg = process.argv.find((a) => !a.startsWith('-') && a.endsWith('.xlsx'));
if (!fileArg) {
  console.error('Usage: npx tsx --env-file=.env scripts/apply-oregon-coast-contact-enrichment.ts <file.xlsx> [--apply]');
  process.exit(1);
}

const url = process.env.PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error('Need PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type EnrichmentRow = {
  store: string;
  city: string;
  address: string;
  crmPhone: string;
  verifiedPhone: string;
  websiteUrl: string;
  publicEmail: string;
  primaryContact: string;
  role: string;
  confidence: string;
  notes: string;
  sourceUrl1: string;
  sourceUrl2: string;
};

const SKIP_VALUE_RE =
  /^(not publicly found|not publicly found\.|no verified standalone site|not applicable|n\/a)$/i;

function clean(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  if (!v || SKIP_VALUE_RE.test(v)) return null;
  return v;
}

function cleanEmail(value: string | null | undefined): string | null {
  const v = clean(value?.replace(/\s*\([^)]*\)\s*/g, ' '));
  if (!v || !v.includes('@')) return null;
  return v.split(/\s+/)[0] ?? null;
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
  return v;
}

function parseStreetAddress(full: string): string {
  const trimmed = full.trim();
  const comma = trimmed.indexOf(',');
  if (comma > 0) return trimmed.slice(0, comma).trim();
  return trimmed;
}

function parsePostalCode(full: string): string | null {
  const m = full.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m?.[1] ?? null;
}

function mapContactRole(roleText: string): 'owner' | 'buyer' | 'manager' {
  const r = roleText.toLowerCase();
  if (r.includes('owner') || r.includes('founder') || r.includes('president')) return 'owner';
  if (r.includes('buyer') || r.includes('purchasing')) return 'buyer';
  if (r.includes('manager') || r.includes('gm') || r.includes('general manager')) return 'manager';
  return 'buyer';
}

function normalizeMatchName(name: string): string {
  return normalizeProspectName(name.replace(/^\d+\s+/, ''));
}

function compactNameKey(name: string): string {
  return normalizeMatchName(name).replace(/\s+/g, '');
}

function parsePrimaryContact(raw: string): { fullName: string | null; roleHint: string } {
  const v = clean(raw);
  if (!v) return { fullName: null, roleHint: '' };
  if (/not publicly found|not applicable|unspecified|conflicting public ownership/i.test(v)) {
    return { fullName: null, roleHint: v };
  }
  if (v.includes('/')) {
    const primary = v.split('/')[0]?.trim() ?? v;
    return { fullName: primary, roleHint: v };
  }
  if (/roby|last name not published/i.test(v)) {
    const first = v.split('(')[0]?.trim();
    return { fullName: first && first.length > 1 ? first : null, roleHint: v };
  }
  if (/^\(.*\)$/.test(v)) return { fullName: null, roleHint: v };
  return { fullName: v, roleHint: v };
}

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

function loadRowsFromXlsxViaCsvExport(xlsxPath: string): EnrichmentRow[] {
  const csv = execSync(`npx --yes xlsx-cli "${xlsxPath}" --sheet "Contact Enrichment"`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const lines = csv.trim().split(/\r?\n/);
  const header = parseCsvLine(lines[0] ?? '');
  const idx = (name: string) => header.indexOf(name);
  const rows: EnrichmentRow[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    rows.push({
      store: cols[idx('Store')] ?? '',
      city: cols[idx('City')] ?? '',
      address: cols[idx('Address')] ?? '',
      crmPhone: cols[idx('CRM Phone')] ?? '',
      verifiedPhone: cols[idx('Verified Phone')] ?? '',
      websiteUrl: cols[idx('Website URL')] ?? '',
      publicEmail: cols[idx('Public Email')] ?? '',
      primaryContact: cols[idx('Primary Contact')] ?? '',
      role: cols[idx('Role')] ?? '',
      confidence: cols[idx('Confidence')] ?? '',
      notes: cols[idx('Notes / CRM Correction')] ?? '',
      sourceUrl1: cols[idx('Source URL 1')] ?? '',
      sourceUrl2: cols[idx('Source URL 2')] ?? '',
    });
  }
  return rows;
}

type ProspectRow = {
  id: number;
  name: string;
  city: string | null;
  region: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  postal_code: string | null;
  buyer_verified: boolean;
  import_protected: boolean;
  verification_status: string | null;
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

function normalizeContactEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

function normalizeContactFullName(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().toLowerCase();
}

function classifyContactDuplicate(
  contacts: readonly ContactLite[],
  input: { fullName: string; email?: string | null },
): { kind: 'email' | 'name'; contact: ContactLite } | null {
  const byEmail = contacts.find(
    (c) =>
      normalizeContactEmail(input.email) &&
      normalizeContactEmail(c.email) === normalizeContactEmail(input.email),
  );
  if (byEmail) return { kind: 'email', contact: byEmail };
  const name = normalizeContactFullName(input.fullName);
  if (!name) return null;
  const byName = contacts.find((c) => normalizeContactFullName(c.fullName) === name);
  if (byName) return { kind: 'name', contact: byName };
  return null;
}

function matchProspect(sheet: EnrichmentRow, prospects: ProspectRow[]): ProspectRow | null {
  const sheetNorm = normalizeMatchName(sheet.store);
  const sheetCompact = compactNameKey(sheet.store);
  const sheetCity = normalizeProspectName(sheet.city);
  const exact = prospects.filter(
    (p) => normalizeMatchName(p.name) === sheetNorm || compactNameKey(p.name) === sheetCompact,
  );
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    const byCity = exact.filter((p) => normalizeProspectName(p.city ?? '') === sheetCity);
    if (byCity.length === 1) return byCity[0];
    return null;
  }
  const contained = prospects.filter((p) => {
    const pn = normalizeMatchName(p.name);
    const pc = compactNameKey(p.name);
    return pn.includes(sheetNorm) || sheetNorm.includes(pn) || pc.includes(sheetCompact) || sheetCompact.includes(pc);
  });
  if (contained.length === 1) return contained[0];
  if (contained.length > 1) {
    const byCity = contained.filter((p) => normalizeProspectName(p.city ?? '') === sheetCity);
    if (byCity.length === 1) return byCity[0];
  }
  return null;
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
    default:
      return null;
  }
}
function contactNotes(row: EnrichmentRow, extra?: string): string | null {
  const parts = [
    row.notes?.trim(),
    row.role?.trim() ? `Role evidence: ${row.role.trim()}` : '',
    row.confidence?.trim() ? `Confidence: ${row.confidence.trim()}` : '',
    [row.sourceUrl1, row.sourceUrl2].filter(Boolean).join(' · '),
    extra,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join('\n');
}

const xlsxPath = resolve(fileArg);
const enrichmentRows = loadRowsFromXlsxViaCsvExport(xlsxPath);

const { data: prospects, error: prospectErr } = await client
  .from('prospects')
  .select(
    'id, name, city, region, phone, website, address, postal_code, buyer_verified, import_protected, verification_status',
  )
  .eq('region', 'Oregon Coast')
  .order('id');

if (prospectErr) {
  console.error(prospectErr.message);
  process.exit(1);
}

const pool = (prospects ?? []) as ProspectRow[];
const matchedIds = new Set<number>();
const report: string[] = [];

for (const row of enrichmentRows) {
  const prospect = matchProspect(row, pool.filter((p) => !matchedIds.has(p.id)));
  if (!prospect) {
    report.push(`UNMATCHED\t${row.store}\t${row.city}`);
    continue;
  }
  matchedIds.add(prospect.id);

  const phone = normalizePhone(row.verifiedPhone) ?? normalizePhone(row.crmPhone);
  const website = cleanWebsite(row.websiteUrl);
  const address = parseStreetAddress(row.address);
  const postalCode = parsePostalCode(row.address);
  const email = cleanEmail(row.publicEmail);
  const { fullName, roleHint } = parsePrimaryContact(row.primaryContact);
  const role = mapContactRole(row.role || roleHint);

  const prospectPatch: Record<string, string> = {};
  if (phone && !(prospect.phone ?? '').trim()) prospectPatch.phone = phone;
  else if (phone && normalizePhone(prospect.phone) !== phone) {
    // Spreadsheet explicitly verified phone — apply when CRM empty or differs (corrections noted)
    prospectPatch.phone = phone;
  }
  if (website && !(prospect.website ?? '').trim()) prospectPatch.website = website;
  else if (website && prospect.website?.trim() !== website) prospectPatch.website = website;
  if (address && !(prospect.address ?? '').trim()) prospectPatch.address = address;
  if (postalCode && !(prospect.postal_code ?? '').trim()) prospectPatch.postal_code = postalCode;
  if (row.city.trim() && normalizeProspectName(prospect.city ?? '') !== normalizeProspectName(row.city)) {
    prospectPatch.city = row.city.trim();
  }

  report.push(
    `MATCH\t${prospect.id}\t${prospect.name}\t<= ${row.store}\tphone=${prospectPatch.phone ?? '—'}\tweb=${prospectPatch.website ?? '—'}\tcontact=${fullName ?? '—'}\temail=${email ?? '—'}`,
  );

  if (!apply) continue;

  if (Object.keys(prospectPatch).length > 0) {
    const { error: updErr } = await client.from('prospects').update(prospectPatch).eq('id', prospect.id);
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
      provider: 'oregon_coast_contact_enrichment',
      confidence: row.confidence || null,
      sourceUrls: [row.sourceUrl1, row.sourceUrl2].filter(Boolean),
    }));
    await insertRetailerFieldChanges(client, auditRows);
  }

  if (!fullName && !email) continue;

  const { data: existingContacts, error: contactListErr } = await client
    .from('account_contacts')
    .select('id, account_id, role, full_name, title, phone, email, is_primary, notes')
    .eq('account_id', prospect.id);

  if (contactListErr) {
    report.push(`  ERROR contacts ${prospect.id}: ${contactListErr.message}`);
    continue;
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

  const dup = fullName
    ? classifyContactDuplicate(contacts, { fullName, email })
    : email
      ? classifyContactDuplicate(contacts, { fullName: email.split('@')[0] ?? email, email })
      : null;

  const notes = contactNotes(row);
  const title = clean(row.role);

  if (dup?.kind === 'email' && dup.contact) {
    const patch: Record<string, unknown> = {};
    if (title && !(dup.contact.title ?? '').trim()) patch.title = title;
    if (notes) patch.notes = [dup.contact.notes, notes].filter(Boolean).join('\n\n');
    if (Object.keys(patch).length > 0) {
      await client.from('account_contacts').update(patch).eq('id', dup.contact.id);
      report.push(`  UPDATED contact ${dup.contact.id} (email match)`);
    }
    continue;
  }

  if (dup?.kind === 'name' && dup.contact) {
    const patch: Record<string, unknown> = {};
    if (email && !(dup.contact.email ?? '').trim()) patch.email = email;
    if (title && !(dup.contact.title ?? '').trim()) patch.title = title;
    if (phone && !(dup.contact.phone ?? '').trim()) patch.phone = phone;
    if (notes) patch.notes = [dup.contact.notes, notes].filter(Boolean).join('\n\n');
    if (Object.keys(patch).length > 0) {
      await client.from('account_contacts').update(patch).eq('id', dup.contact.id);
      report.push(`  UPDATED contact ${dup.contact.id} (name match)`);
    }
    continue;
  }

  const hasPrimary = contacts.some((c) => c.isPrimary);
  const { error: insErr } = await client.from('account_contacts').insert({
    account_id: prospect.id,
    role,
    full_name: fullName ?? email?.split('@')[0] ?? 'Contact',
    title,
    phone: phone ?? null,
    email,
    is_primary: !hasPrimary,
    notes,
  });
  if (insErr) report.push(`  ERROR insert contact ${prospect.id}: ${insErr.message}`);
  else report.push(`  INSERTED contact for ${prospect.id}`);
}

const unmatchedProspects = pool.filter((p) => !matchedIds.has(p.id));
console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
console.log(`Sheet rows: ${enrichmentRows.length}, matched: ${matchedIds.size}, unmatched sheet: ${enrichmentRows.length - matchedIds.size}`);
console.log(`Oregon Coast CRM prospects not in sheet: ${unmatchedProspects.length}`);
if (unmatchedProspects.length > 0 && unmatchedProspects.length <= 10) {
  for (const p of unmatchedProspects) console.log(`  CRM only: ${p.id} ${p.name} (${p.city})`);
}
console.log('---');
for (const line of report) console.log(line);
