/**
 * Yelp Fusion API pilot — match Oregon Coast prospects and propose blank-only identity patches.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/yelp-enrich-oregon-prospects.ts
 *   npx tsx --env-file=.env scripts/yelp-enrich-oregon-prospects.ts --region "Oregon Coast" --limit 5
 *   npx tsx --env-file=.env scripts/yelp-enrich-oregon-prospects.ts --apply
 *   npx tsx --env-file=.env scripts/yelp-enrich-oregon-prospects.ts --ids 123,456
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { isValidOgrProductEmailRecipient } from '../src/lib/ogrProductEmailLimits.ts';
import { insertRetailerFieldChanges } from '../src/lib/retailerFieldChanges.ts';
import { matchProspectToYelp } from '../src/lib/yelp/businessMatch.ts';
import { buildBlankOnlyProspectPatch } from '../src/lib/yelp/mapYelpToProspectPatch.ts';

const REPORT_PATH = resolve(
  process.cwd(),
  'docs/prospect-uploads/oregon/yelp-enrichment-pilot-report.csv',
);

const API_DELAY_MS = 200;

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function readArg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function readIdsArg(): number[] | null {
  const raw = readArg('ids', '');
  if (!raw.trim()) return null;
  const ids = raw
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((id) => Number.isFinite(id));
  return ids.length > 0 ? ids : null;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function blankIdentityFieldCount(prospect: ProspectRow): number {
  let count = 0;
  if (!(prospect.phone ?? '').trim()) count += 1;
  if (!(prospect.website ?? '').trim()) count += 1;
  if (!(prospect.address ?? '').trim()) count += 1;
  if (!(prospect.city ?? '').trim()) count += 1;
  if (!(prospect.postal_code ?? '').trim()) count += 1;
  return count;
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

type ProspectRow = {
  id: number;
  name: string;
  city: string | null;
  region: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  postal_code: string | null;
  buyer_verified: boolean | null;
  import_protected: boolean | null;
  verification_status: string | null;
};

type ContactLite = {
  id: string;
  role: 'buyer' | 'manager' | 'owner';
  fullName: string;
  email: string | null;
  isPrimary: boolean;
};

function hasUsableOutreachEmail(contacts: readonly ContactLite[]): boolean {
  const usable = contacts.filter((contact) => {
    const email = contact.email?.trim() ?? '';
    return email.length > 0 && isValidOgrProductEmailRecipient(email);
  });
  if (usable.length === 0) return false;
  const primary = usable.find((row) => row.isPrimary);
  if (primary) return true;
  const buyer = usable.find((row) => row.role === 'buyer');
  return Boolean(buyer ?? usable[0]);
}

type ReportRow = {
  retailer_id: number;
  crm_name: string;
  crm_city: string;
  match_confidence: string;
  match_method: string;
  match_score: string;
  yelp_id: string;
  yelp_name: string;
  yelp_url: string;
  yelp_phone: string;
  yelp_address: string;
  yelp_website: string;
  proposed_patch_json: string;
  skipped_fields: string;
  apply_status: string;
};

const apply = hasFlag('apply');
const region = readArg('region', 'Oregon Coast');
const limit = Number.parseInt(readArg('limit', '5'), 10);
const idOverride = readIdsArg();

if (!Number.isFinite(limit) || limit < 1) {
  console.error('--limit must be a positive integer');
  process.exit(1);
}

if (!process.env.YELP_FUSION_API_KEY?.trim()) {
  console.error('Need YELP_FUSION_API_KEY in environment');
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

let prospectQuery = client
  .from('prospects')
  .select(
    'id, name, city, region, phone, website, address, postal_code, buyer_verified, import_protected, verification_status',
  )
  .eq('region', region)
  .order('id', { ascending: true });

if (idOverride) {
  prospectQuery = prospectQuery.in('id', idOverride);
}

const { data: prospects, error: prospectErr } = await prospectQuery;

if (prospectErr) {
  console.error(prospectErr.message);
  process.exit(1);
}

const prospectPool = (prospects ?? []) as ProspectRow[];
const prospectIds = prospectPool.map((p) => p.id);

const contactsByAccountId = new Map<number, ContactLite[]>();

if (prospectIds.length > 0) {
  const { data: contacts, error: contactErr } = await client
    .from('account_contacts')
    .select(
      'id, account_id, role, full_name, title, phone, email, is_primary, notes, created_at, updated_at',
    )
    .in('account_id', prospectIds);

  if (contactErr) {
    console.error(contactErr.message);
    process.exit(1);
  }

  for (const row of contacts ?? []) {
    const mapped: ContactLite = {
      id: row.id as string,
      role: row.role as ContactLite['role'],
      fullName: row.full_name as string,
      email: row.email as string | null,
      isPrimary: row.is_primary as boolean,
    };
    const list = contactsByAccountId.get(row.account_id) ?? [];
    list.push(mapped);
    contactsByAccountId.set(row.account_id, list);
  }
}

const cohort = prospectPool
  .filter((prospect) => {
    if (idOverride) return true;
    const contacts = contactsByAccountId.get(prospect.id) ?? [];
    return !hasUsableOutreachEmail(contacts);
  })
  .sort((a, b) => {
    const blankDiff = blankIdentityFieldCount(b) - blankIdentityFieldCount(a);
    if (blankDiff !== 0) return blankDiff;
    return a.id - b.id;
  })
  .slice(0, limit);

if (cohort.length === 0) {
  console.log(`No prospects selected for region "${region}".`);
  process.exit(0);
}

console.log(
  `${apply ? 'APPLY' : 'DRY-RUN'} — Yelp enrichment pilot for ${cohort.length} prospect(s) in "${region}"`,
);

const reportRows: ReportRow[] = [];
let highCount = 0;
let mediumCount = 0;
let lowCount = 0;
let noMatchCount = 0;

for (const prospect of cohort) {
  await sleep(API_DELAY_MS);

  let match;
  try {
    match = await matchProspectToYelp({
      name: prospect.name,
      address: prospect.address,
      city: prospect.city,
      postalCode: prospect.postal_code,
      phone: prospect.phone,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reportRows.push({
      retailer_id: prospect.id,
      crm_name: prospect.name,
      crm_city: prospect.city ?? '',
      match_confidence: 'error',
      match_method: '',
      match_score: '',
      yelp_id: '',
      yelp_name: '',
      yelp_url: '',
      yelp_phone: '',
      yelp_address: '',
      yelp_website: '',
      proposed_patch_json: '',
      skipped_fields: message,
      apply_status: 'error',
    });
    console.error(`ERROR ${prospect.id} ${prospect.name}: ${message}`);
    continue;
  }

  if (!match) {
    noMatchCount += 1;
    reportRows.push({
      retailer_id: prospect.id,
      crm_name: prospect.name,
      crm_city: prospect.city ?? '',
      match_confidence: 'none',
      match_method: '',
      match_score: '',
      yelp_id: '',
      yelp_name: '',
      yelp_url: '',
      yelp_phone: '',
      yelp_address: '',
      yelp_website: '',
      proposed_patch_json: '',
      skipped_fields: '',
      apply_status: 'no_match',
    });
    console.log(`NO MATCH\t${prospect.id}\t${prospect.name}`);
    continue;
  }

  if (match.confidence === 'high') highCount += 1;
  else if (match.confidence === 'medium') mediumCount += 1;
  else lowCount += 1;

  const { patch, skipped } = buildBlankOnlyProspectPatch(prospect, match.business);
  const patchKeys = Object.keys(patch);
  let applyStatus = 'dry_run';

  if (apply) {
    if (match.confidence !== 'high') {
      applyStatus = 'skipped_ambiguous';
    } else if (patchKeys.length === 0) {
      applyStatus = 'skipped_no_patch';
    } else {
      const { error: updErr } = await client.from('prospects').update(patch).eq('id', prospect.id);
      if (updErr) {
        applyStatus = 'error';
        console.error(`ERROR apply ${prospect.id}: ${updErr.message}`);
      } else {
        applyStatus = 'applied';
        const auditRows = Object.entries(patch).map(([fieldPath, newValue]) => ({
          retailerId: prospect.id,
          fieldPath,
          oldValue: prospectFieldValue(prospect, fieldPath),
          newValue,
          source: 'import' as const,
          status: 'applied' as const,
          provider: 'yelp_fusion_enrichment',
          confidence: match.confidence,
          sourceUrls: [match.business.url, match.business.businessUrl].filter(Boolean),
        }));
        const auditResult = await insertRetailerFieldChanges(client, auditRows);
        if (!auditResult.ok) {
          applyStatus = 'error';
          console.error(`ERROR audit ${prospect.id}: ${auditResult.error}`);
        }
      }
    }
  }

  reportRows.push({
    retailer_id: prospect.id,
    crm_name: prospect.name,
    crm_city: prospect.city ?? '',
    match_confidence: match.confidence,
    match_method: match.matchMethod,
    match_score: String(match.score),
    yelp_id: match.business.id,
    yelp_name: match.business.name,
    yelp_url: match.business.url,
    yelp_phone: match.business.phone ?? '',
    yelp_address: match.business.address1 ?? '',
    yelp_website: match.business.businessUrl ?? '',
    proposed_patch_json: JSON.stringify(patch),
    skipped_fields: JSON.stringify(skipped),
    apply_status: applyStatus,
  });

  console.log(
    `${match.confidence.toUpperCase()}\t${prospect.id}\t${prospect.name}\t<= ${match.business.name}\tpatch=${patchKeys.join(',') || '—'}\t${applyStatus}`,
  );
}

const header = [
  'retailer_id',
  'crm_name',
  'crm_city',
  'match_confidence',
  'match_method',
  'match_score',
  'yelp_id',
  'yelp_name',
  'yelp_url',
  'yelp_phone',
  'yelp_address',
  'yelp_website',
  'proposed_patch_json',
  'skipped_fields',
  'apply_status',
];

const csv = [
  header.join(','),
  ...reportRows.map((row) =>
    header.map((col) => csvEscape(String(row[col as keyof ReportRow] ?? ''))).join(','),
  ),
].join('\n');

writeFileSync(REPORT_PATH, csv, 'utf8');

console.log('');
console.log(
  `Summary: high=${highCount} medium=${mediumCount} low=${lowCount} no_match=${noMatchCount}`,
);
console.log(`Report: ${REPORT_PATH}`);
