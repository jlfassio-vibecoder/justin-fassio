/**
 * Backfill Oregon CRM driveable regions for prospects still labeled statewide (Oregon).
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/backfill-oregon-crm-regions.ts
 *   npx tsx --env-file=.env scripts/backfill-oregon-crm-regions.ts --apply
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadOregonImportRegionOverlay } from '../src/lib/geoCatalog/oregonImportRegionOverlay.ts';
import {
  isOregonRegionApplyConfidence,
  suggestOregonCrmRegion,
} from '../src/lib/geoCatalog/suggestOregonCrmRegion.ts';

const REPORT_PATH = resolve(
  process.cwd(),
  'docs/prospect-uploads/oregon/region-backfill-report.csv',
);

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const apply = hasFlag('apply');
const includeLowConfidence = hasFlag('include-low-confidence');

const url = process.env.PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !key) {
  console.error('Need PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type CohortRow = {
  id: number;
  name: string;
  city: string | null;
  postal_code: string | null;
  address: string | null;
  region: string;
  primary_district: string | null;
  external_id: string | null;
};

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const { data: storeTerr, error: storeErr } = await client
  .from('territories')
  .select('id')
  .eq('code', 'or')
  .maybeSingle();

if (storeErr || !storeTerr?.id) {
  console.error(storeErr?.message ?? 'Oregon store territory not found');
  process.exit(1);
}

const { data: rows, error: cohortErr } = await client
  .from('prospects')
  .select('id, name, city, postal_code, address, region, primary_district, external_id')
  .eq('territory_id', storeTerr.id)
  .ilike('region', 'oregon')
  .order('id', { ascending: true });

if (cohortErr) {
  console.error(cohortErr.message);
  process.exit(1);
}

const cohort = (rows ?? []) as CohortRow[];
const overlay = loadOregonImportRegionOverlay();

type ReportRow = {
  id: number;
  name: string;
  city: string;
  zip: string;
  old_region: string;
  suggested_region: string;
  matched_by: string;
  confidence: string;
  action: string;
};

const report: ReportRow[] = [];
const byRegion: Record<string, number> = {};
let resolved = 0;
let unresolved = 0;
let skippedConfidence = 0;
let applied = 0;
const failures: Array<{ id: number; error: string }> = [];

for (const p of cohort) {
  const suggestion = suggestOregonCrmRegion({
    primaryDistrict: p.primary_district,
    postalCode: p.postal_code,
    address: p.address,
    city: p.city,
    name: p.name,
    prospectId: p.id,
    externalId: p.external_id,
    importOverlay: overlay,
  });

  const zip = (p.postal_code ?? '').trim();
  let action: string;
  let suggestedRegion: string;
  let matchedBy: string;
  let confidence: string;

  if (suggestion.ok) {
    resolved += 1;
    suggestedRegion = suggestion.region;
    matchedBy = suggestion.matchedBy;
    confidence = suggestion.confidence;
    byRegion[suggestion.region] = (byRegion[suggestion.region] ?? 0) + 1;

    const canApply = isOregonRegionApplyConfidence(suggestion.confidence) || includeLowConfidence;
    if (canApply) {
      action = apply ? 'apply' : 'would_apply';
    } else {
      action = 'skip_low_confidence';
      skippedConfidence += 1;
    }
  } else {
    unresolved += 1;
    suggestedRegion = '';
    matchedBy = suggestion.reason;
    confidence = 'none';
    action = 'manual_review';
  }

  report.push({
    id: p.id,
    name: p.name,
    city: (p.city ?? '').trim(),
    zip,
    old_region: p.region,
    suggested_region: suggestedRegion,
    matched_by: matchedBy,
    confidence,
    action,
  });

  if (!apply || action !== 'apply' || !suggestion.ok) continue;

  const { error: updErr } = await client
    .from('prospects')
    .update({ region: suggestion.region })
    .eq('id', p.id)
    .ilike('region', 'oregon');

  if (updErr) {
    failures.push({ id: p.id, error: updErr.message });
    continue;
  }

  const actorId = process.env.BACKFILL_ACTOR_ID?.trim() || null;
  const { error: auditErr } = await client.from('retailer_field_changes').insert({
    retailer_id: p.id,
    field_path: 'region',
    old_value: p.region,
    new_value: suggestion.region,
    source: 'calculated',
    actor_id: actorId,
    status: 'applied',
    confidence: suggestion.confidence,
    provider: 'oregon_region_backfill',
  });

  if (auditErr) {
    failures.push({ id: p.id, error: `updated but audit failed: ${auditErr.message}` });
  } else {
    applied += 1;
  }
}

const header = 'id,name,city,zip,old_region,suggested_region,matched_by,confidence,action\n';
const body = report
  .map((r) =>
    [
      r.id,
      csvEscape(r.name),
      csvEscape(r.city),
      csvEscape(r.zip),
      csvEscape(r.old_region),
      csvEscape(r.suggested_region),
      csvEscape(r.matched_by),
      csvEscape(r.confidence),
      csvEscape(r.action),
    ].join(','),
  )
  .join('\n');
writeFileSync(REPORT_PATH, header + body + '\n', 'utf8');

console.log(
  JSON.stringify(
    {
      mode: apply ? 'apply' : 'dry-run',
      cohortCount: cohort.length,
      resolved,
      unresolved,
      skippedLowConfidence: skippedConfidence,
      applied,
      failureCount: failures.length,
      byRegion,
      reportPath: REPORT_PATH,
      failures: failures.slice(0, 25),
    },
    null,
    2,
  ),
);

if (failures.length > 0 && applied === 0 && apply) process.exit(1);
