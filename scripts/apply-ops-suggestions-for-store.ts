/**
 * One-shot: set operational_territory_id for store-geo prospects via suggest path only.
 * Does not change prospects.territory_id (store geo).
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/apply-ops-suggestions-for-store.ts --store=or
 */
import { createClient } from '@supabase/supabase-js';
import { suggestOperationalTerritoryForAccount } from '../src/lib/operationalTerritories/suggestOperationalTerritory.ts';

function argValue(name: string): string {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : '';
}

const store = (argValue('store') || 'or').toLowerCase();
const url = process.env.PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !key) {
  console.error('Need PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: storeTerr, error: storeErr } = await client
  .from('territories')
  .select('id')
  .eq('code', store)
  .maybeSingle();
if (storeErr || !storeTerr) {
  console.error(storeErr?.message ?? `Store territory ${store} not found`);
  process.exit(1);
}

const { data: opsRows, error: opsErr } = await client
  .from('operational_territories')
  .select('territory_id, territories!inner(id, code, name, status, active)')
  .eq('territories.active', true)
  .eq('territories.status', 'active');
if (opsErr) {
  console.error(opsErr.message);
  process.exit(1);
}

const opsByCode = new Map<string, string>();
for (const row of opsRows ?? []) {
  const terr = row.territories as unknown as { code: string; id: string } | null;
  if (terr?.code && terr.id) opsByCode.set(terr.code, terr.id);
}

const { data: prospects, error: pErr } = await client
  .from('prospects')
  .select('id, name, postal_code, address, operational_territory_id')
  .eq('territory_id', storeTerr.id)
  .is('operational_territory_id', null)
  .order('id', { ascending: true });
if (pErr) {
  console.error(pErr.message);
  process.exit(1);
}

let applied = 0;
let skipped = 0;
const failures: Array<{ prospectId: number; error: string }> = [];

for (const p of prospects ?? []) {
  const suggestion = suggestOperationalTerritoryForAccount({
    postalCode: p.postal_code,
    address: p.address,
    storeTerritoryCode: store,
  });
  if (!suggestion.ok) {
    skipped += 1;
    continue;
  }
  const opsId = opsByCode.get(suggestion.territoryCode);
  if (!opsId) {
    failures.push({ prospectId: p.id, error: `No active ops id for ${suggestion.territoryCode}` });
    continue;
  }
  const { error: updErr } = await client
    .from('prospects')
    .update({ operational_territory_id: opsId })
    .eq('id', p.id)
    .is('operational_territory_id', null);
  if (updErr) {
    failures.push({ prospectId: p.id, error: updErr.message });
    continue;
  }
  applied += 1;
}

// Resolve open review-queue rows for assigned prospects (best-effort).
const { data: nowAssigned } = await client
  .from('prospects')
  .select('id')
  .eq('territory_id', storeTerr.id)
  .not('operational_territory_id', 'is', null);
const resolveIds = (nowAssigned ?? []).map((p) => String(p.id));
let reviewResolveError: string | null = null;
if (resolveIds.length > 0) {
  const { error: resolveErr } = await client
    .from('operational_territory_review_queue')
    .update({
      resolved_at: new Date().toISOString(),
      resolution: 'assigned',
    })
    .eq('entity_type', 'prospect')
    .is('resolved_at', null)
    .in('entity_id', resolveIds);
  reviewResolveError = resolveErr?.message ?? null;
}

console.log(
  JSON.stringify(
    {
      store,
      candidates: (prospects ?? []).length,
      applied,
      skipped,
      failureCount: failures.length,
      failures: failures.slice(0, 25),
      reviewResolveError,
    },
    null,
    2,
  ),
);

if (failures.length > 0 && applied === 0) process.exit(1);
