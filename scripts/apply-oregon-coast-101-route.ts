/**
 * Upsert Oregon Coast Hwy 101 route spreadsheet into CRM prospects.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/apply-oregon-coast-101-route.ts <file.xlsx>
 *   npx tsx --env-file=.env scripts/apply-oregon-coast-101-route.ts <file.xlsx> --apply
 */
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { mapContactRole } from '../src/lib/contactResearch/mapContactRole.ts';
import { normalizeProspectName } from '../src/lib/prospectListImport.ts';
import { insertRetailerFieldChanges } from '../src/lib/retailerFieldChanges.ts';
import {
  externalIdSlug,
  isBigWheelSkip,
  isUnusableRouteName,
  mapOregonCoast101GradeToPriority,
  type OregonCoast101RouteRow,
  parseOregonCoast101ContactName,
  parseOregonCoast101CsvRows,
  shouldApplySheetGrade,
} from '../src/lib/oregonCoast101Route.ts';

const BATCH_TAG = 'Oregon Coast 101 route 2026-08-27';
const EXTERNAL_PREFIX = 'or-101-20260827';
const BIG_WHEEL_ID = 613;

const apply = process.argv.includes('--apply');
const fileArg = process.argv.find((a) => !a.startsWith('-') && a.endsWith('.xlsx'));
if (!fileArg) {
  console.error(
    'Usage: npx tsx --env-file=.env scripts/apply-oregon-coast-101-route.ts <file.xlsx> [--apply]',
  );
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

type ProspectRow = {
  id: number;
  name: string;
  city: string | null;
  region: string;
  phone: string | null;
  website: string | null;
  priority: string | null;
  provisional_grade: string | null;
  source_note: string | null;
  buyer_verified: boolean;
  import_protected: boolean;
  external_id: string | null;
  account_status: string | null;
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

function loadRouteRows(xlsxPath: string): OregonCoast101RouteRow[] {
  const csv = execSync(`npx --yes xlsx-cli "${xlsxPath}"`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const lines = csv.trim().split(/\r?\n/);
  const table = lines.map((line) => parseCsvLine(line));
  return parseOregonCoast101CsvRows(table);
}

function compactNameKey(name: string): string {
  return normalizeProspectName(name).replace(/\s+/g, '');
}

function matchProspect(
  sheet: OregonCoast101RouteRow,
  prospects: ProspectRow[],
):
  | { kind: 'match'; prospect: ProspectRow }
  | { kind: 'ambiguous'; candidates: ProspectRow[] }
  | null {
  const sheetNorm = normalizeProspectName(sheet.name);
  const sheetCompact = compactNameKey(sheet.name);
  const sheetCity = normalizeProspectName(sheet.city);

  const exact = prospects.filter(
    (p) => normalizeProspectName(p.name) === sheetNorm || compactNameKey(p.name) === sheetCompact,
  );
  if (exact.length === 1) return { kind: 'match', prospect: exact[0]! };
  if (exact.length > 1) {
    const byCity = exact.filter((p) => normalizeProspectName(p.city ?? '') === sheetCity);
    if (byCity.length === 1) return { kind: 'match', prospect: byCity[0]! };
    return { kind: 'ambiguous', candidates: byCity.length > 0 ? byCity : exact };
  }

  const contained = prospects.filter((p) => {
    const pn = normalizeProspectName(p.name);
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

function buildSourceNote(sheet: OregonCoast101RouteRow, existing: string | null): string {
  const parts = [
    existing?.trim() || null,
    `${BATCH_TAG}; grade: ${sheet.rawGrade}`,
    sheet.why?.trim() ? sheet.why.trim().slice(0, 500) : null,
    sheet.contactRaw?.trim() && !parseOregonCoast101ContactName(sheet.contactRaw)
      ? `Contact research: ${sheet.contactRaw.trim().slice(0, 300)}`
      : null,
  ].filter(Boolean);
  return parts.join('\n\n');
}

const xlsxPath = resolve(fileArg);
const sheetRows = loadRouteRows(xlsxPath);

const { data: territory, error: terrErr } = await client
  .from('territories')
  .select('id, code')
  .eq('code', 'or')
  .maybeSingle();
if (terrErr || !territory?.id) {
  console.error(terrErr?.message ?? 'Oregon territory (code=or) not found');
  process.exit(1);
}

const { data: prospects, error: prospectErr } = await client
  .from('prospects')
  .select(
    'id, name, city, region, phone, website, priority, provisional_grade, source_note, buyer_verified, import_protected, external_id, account_status',
  )
  .or('region.eq.Oregon Coast,region.eq.Oregon')
  .order('id');

if (prospectErr) {
  console.error(prospectErr.message);
  process.exit(1);
}

const pool = (prospects ?? []) as ProspectRow[];
const matchedIds = new Set<number>();
const report: string[] = [];
let matchCount = 0;
let insertCount = 0;
let skipCount = 0;
let ambiguousCount = 0;

for (const row of sheetRows) {
  if (isBigWheelSkip(row.name) || isUnusableRouteName(row.name, row.city)) {
    skipCount += 1;
    report.push(`SKIP\t${row.name}\t${row.city}`);
    continue;
  }

  const hit = matchProspect(
    row,
    pool.filter((p) => !matchedIds.has(p.id) && p.id !== BIG_WHEEL_ID),
  );

  if (hit?.kind === 'ambiguous') {
    ambiguousCount += 1;
    report.push(
      `AMBIGUOUS\t${row.name}\t${row.city}\tcandidates=${hit.candidates.map((c) => `${c.id}:${c.name}`).join('|')}`,
    );
    continue;
  }

  const { priority, provisionalGrade } = mapOregonCoast101GradeToPriority(row.primaryGrade);
  const contactName = parseOregonCoast101ContactName(row.contactRaw);

  if (hit?.kind === 'match') {
    const prospect = hit.prospect;
    matchedIds.add(prospect.id);
    matchCount += 1;

    if (prospect.import_protected || prospect.account_status === 'active') {
      skipCount += 1;
      report.push(
        `SKIP_PROTECTED\t${prospect.id}\t${prospect.name}\tstatus=${prospect.account_status ?? '—'}\tprotected=${prospect.import_protected}`,
      );
      continue;
    }

    const patch: Record<string, string | null> = {};
    if (row.phone && !(prospect.phone ?? '').trim()) patch.phone = row.phone;
    else if (row.phone && (prospect.phone ?? '').trim() !== row.phone) patch.phone = row.phone;
    if (row.website && !(prospect.website ?? '').trim()) patch.website = row.website;
    else if (row.website && (prospect.website ?? '').trim() !== row.website) {
      patch.website = row.website;
    }
    if (shouldApplySheetGrade(prospect.priority, row.primaryGrade)) {
      patch.priority = priority;
      patch.provisional_grade = provisionalGrade;
    }
    const nextNote = buildSourceNote(row, prospect.source_note);
    if (nextNote !== (prospect.source_note ?? '').trim()) patch.source_note = nextNote;

    report.push(
      `MATCH\t${prospect.id}\t${prospect.name}\t<= ${row.name}\t${row.city}\tgrade=${row.primaryGrade}\tpatch=${Object.keys(patch).join(',') || '—'}\tcontact=${contactName ?? '—'}`,
    );

    if (!apply) continue;

    if (Object.keys(patch).length > 0) {
      const { error: updErr } = await client.from('prospects').update(patch).eq('id', prospect.id);
      if (updErr) {
        report.push(`  ERROR prospect ${prospect.id}: ${updErr.message}`);
        continue;
      }
      await insertRetailerFieldChanges(
        client,
        Object.entries(patch).map(([fieldPath, newValue]) => ({
          retailerId: prospect.id,
          fieldPath,
          oldValue: (prospect as Record<string, unknown>)[fieldPath] ?? null,
          newValue,
          source: 'import' as const,
          provider: 'oregon_coast_101_route',
          confidence: row.primaryGrade,
          sourceUrls: [],
        })),
      );
    }

    if (!contactName && !row.email) continue;

    const { data: existingContacts, error: contactListErr } = await client
      .from('account_contacts')
      .select('id, full_name, email, title, phone, is_primary, notes')
      .eq('account_id', prospect.id);
    if (contactListErr) {
      report.push(`  ERROR contacts ${prospect.id}: ${contactListErr.message}`);
      continue;
    }

    const contacts = existingContacts ?? [];
    const emailNorm = (row.email ?? '').toLowerCase();
    const nameNorm = (contactName ?? '').toLowerCase();
    const dup =
      contacts.find((c) => emailNorm && (c.email ?? '').toLowerCase() === emailNorm) ??
      contacts.find((c) => nameNorm && (c.full_name ?? '').toLowerCase() === nameNorm);

    if (dup) {
      const cpatch: Record<string, unknown> = {};
      if (row.email && !(dup.email ?? '').trim()) cpatch.email = row.email;
      if (row.phone && !(dup.phone ?? '').trim()) cpatch.phone = row.phone;
      if (Object.keys(cpatch).length > 0) {
        await client.from('account_contacts').update(cpatch).eq('id', dup.id);
        report.push(`  UPDATED contact ${dup.id}`);
      }
      continue;
    }

    const hasPrimary = contacts.some((c) => c.is_primary);
    const { error: insErr } = await client.from('account_contacts').insert({
      account_id: prospect.id,
      role: mapContactRole(row.contactRaw),
      full_name: contactName ?? row.email?.split('@')[0] ?? 'Contact',
      title: null,
      phone: row.phone,
      email: row.email,
      is_primary: !hasPrimary,
      notes: row.contactRaw,
    });
    if (insErr) report.push(`  ERROR insert contact ${prospect.id}: ${insErr.message}`);
    else report.push(`  INSERTED contact for ${prospect.id}`);
    continue;
  }

  // Insert new
  insertCount += 1;
  const externalId = `${EXTERNAL_PREFIX}-${externalIdSlug(row.name)}`;
  const sourceNote = buildSourceNote(row, null);
  report.push(
    `INSERT\t${externalId}\t${row.name}\t${row.city}\tgrade=${row.primaryGrade}\tphone=${row.phone ?? '—'}\tcontact=${contactName ?? '—'}`,
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
  const nextId = (maxRow?.id ?? 0) + 1;

  const { data: inserted, error: insErr } = await client
    .from('prospects')
    .insert({
      id: nextId,
      name: row.name,
      category: 'gift_souvenir',
      region: 'Oregon Coast',
      city: row.city,
      address: '',
      phone: row.phone ?? '',
      territory_id: territory.id,
      primary_district: 'Oregon Coast',
      website: row.website,
      external_id: externalId,
      priority,
      provisional_grade: provisionalGrade,
      verification_status: 'unverified',
      source_note: sourceNote,
      next_action: 'Qualify on Hwy 101 route; confirm buyer and apparel assortment',
    })
    .select('id')
    .maybeSingle();

  if (insErr || !inserted?.id) {
    // Retry once on unique id collision
    if (insErr?.message?.includes('duplicate') || insErr?.code === '23505') {
      const { data: maxRow2 } = await client
        .from('prospects')
        .select('id')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      const retryId = (maxRow2?.id ?? nextId) + 1;
      const { data: inserted2, error: insErr2 } = await client
        .from('prospects')
        .insert({
          id: retryId,
          name: row.name,
          category: 'gift_souvenir',
          region: 'Oregon Coast',
          city: row.city,
          address: '',
          phone: row.phone ?? '',
          territory_id: territory.id,
          primary_district: 'Oregon Coast',
          website: row.website,
          external_id: externalId,
          priority,
          provisional_grade: provisionalGrade,
          verification_status: 'unverified',
          source_note: sourceNote,
          next_action: 'Qualify on Hwy 101 route; confirm buyer and apparel assortment',
        })
        .select('id')
        .maybeSingle();
      if (insErr2 || !inserted2?.id) {
        report.push(
          `  ERROR insert ${row.name}: ${insErr2?.message ?? insErr?.message ?? 'no id'}`,
        );
        continue;
      }
      matchedIds.add(inserted2.id);
      report.push(`  INSERTED prospect ${inserted2.id}`);
      if (contactName || row.email) {
        const { error: cErr } = await client.from('account_contacts').insert({
          account_id: inserted2.id,
          role: mapContactRole(row.contactRaw),
          full_name: contactName ?? row.email?.split('@')[0] ?? 'Contact',
          title: null,
          phone: row.phone,
          email: row.email,
          is_primary: true,
          notes: row.contactRaw,
        });
        if (cErr) report.push(`  ERROR insert contact: ${cErr.message}`);
        else report.push(`  INSERTED contact for ${inserted2.id}`);
      }
      continue;
    }
    report.push(`  ERROR insert ${row.name}: ${insErr?.message ?? 'no id'}`);
    continue;
  }

  matchedIds.add(inserted.id);
  report.push(`  INSERTED prospect ${inserted.id}`);

  if (contactName || row.email) {
    const { error: cErr } = await client.from('account_contacts').insert({
      account_id: inserted.id,
      role: mapContactRole(row.contactRaw),
      full_name: contactName ?? row.email?.split('@')[0] ?? 'Contact',
      title: null,
      phone: row.phone,
      email: row.email,
      is_primary: true,
      notes: row.contactRaw,
    });
    if (cErr) report.push(`  ERROR insert contact: ${cErr.message}`);
    else report.push(`  INSERTED contact for ${inserted.id}`);
  }
}

console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
console.log(`Sheet Oregon rows: ${sheetRows.length}`);
console.log(
  `matched=${matchCount} insert=${insertCount} skip=${skipCount} ambiguous=${ambiguousCount}`,
);
console.log('---');
for (const line of report) console.log(line);
