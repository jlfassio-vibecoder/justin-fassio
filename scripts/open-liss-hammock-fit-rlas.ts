/**
 * Open Living In Sunshine retailer_line_accounts for Go Hammock–fit prospects
 * already in the OGR directory (same prospects.id — no prospect clones).
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/open-liss-hammock-fit-rlas.ts
 *   npx tsx --env-file=.env scripts/open-liss-hammock-fit-rlas.ts --apply
 *
 * Staff UI later: set FEATURE_LIVING_IN_SUNSHINE_SELLING=1 (with multi-line UI+writes).
 */
import { createClient } from '@supabase/supabase-js';
import {
  compareLissFitRank,
  LISS_TERRITORY_CODES,
  prospectFitsLissHammockOpen,
} from '../src/lib/lissHammockProspectFit.ts';

const apply = process.argv.includes('--apply');
const SAMPLE = 25;

const url = process.env.PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error('Need PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Mirrors assertLineAllowsOperationalWrite for LIS with selling enabled (no browser supabase import). */
function lisOperationalWriteAllowed(line: { code: string; status: string }): boolean {
  if (line.code !== 'living-in-sunshine') return false;
  return line.status === 'onboarding' || line.status === 'confirmed' || line.status === 'active';
}

type ProspectRow = {
  id: number;
  name: string;
  city: string | null;
  region: string;
  postal_code: string | null;
  category: string | null;
  secondary_channels: unknown;
  lifestyle_themes: unknown;
  venue_contexts: unknown;
  account_status: string | null;
  fit_score: number | null;
  priority: string | null;
  territories: { code: string } | { code: string }[] | null;
};

function territoryCode(row: ProspectRow): string | null {
  const t = row.territories;
  if (!t) return null;
  if (Array.isArray(t)) return t[0]?.code ?? null;
  return t.code ?? null;
}

async function main() {
  const { data: line, error: lineError } = await client
    .from('lines')
    .select('id, code, status, default_currency')
    .eq('code', 'living-in-sunshine')
    .maybeSingle();
  if (lineError || !line) {
    console.error(
      lineError?.message ?? 'living-in-sunshine line not found — apply LIS migration first',
    );
    process.exit(1);
  }

  const gateOk = lisOperationalWriteAllowed({ code: line.code, status: line.status });
  if (!gateOk) {
    console.error(`LIS operational write not allowed for status=${line.status}; aborting`);
    process.exit(1);
  }

  const pageSize = 1000;
  let from = 0;
  const candidates: Array<{
    id: number;
    name: string;
    city: string | null;
    region: string;
    territoryCode: string;
    fitScore: number | null;
    priority: string | null;
  }> = [];

  for (;;) {
    const { data, error } = await client
      .from('prospects')
      .select(
        'id, name, city, region, postal_code, category, secondary_channels, lifestyle_themes, venue_contexts, account_status, fit_score, priority, territories!inner(code)',
      )
      .in('territories.code', [...LISS_TERRITORY_CODES])
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      console.error(error.message);
      process.exit(1);
    }
    const rows = (data ?? []) as ProspectRow[];
    for (const row of rows) {
      const code = territoryCode(row);
      if (
        !prospectFitsLissHammockOpen({
          territoryCode: code,
          region: row.region,
          city: row.city,
          postalCode: row.postal_code,
          category: row.category,
          secondaryChannels: row.secondary_channels,
          lifestyleThemes: row.lifestyle_themes,
          venueContexts: row.venue_contexts,
          accountStatus: row.account_status,
        })
      ) {
        continue;
      }
      candidates.push({
        id: row.id,
        name: row.name,
        city: row.city,
        region: row.region,
        territoryCode: code ?? '',
        fitScore: row.fit_score,
        priority: row.priority,
      });
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  candidates.sort((a, b) =>
    compareLissFitRank(
      { fitScore: a.fitScore, priority: a.priority },
      { fitScore: b.fitScore, priority: b.priority },
    ),
  );

  const ids = candidates.map((c) => c.id);
  const already = new Set<number>();
  const chunk = 200;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { data, error } = await client
      .from('retailer_line_accounts')
      .select('retailer_id')
      .eq('sales_line_id', line.id)
      .neq('relationship_status', 'terminated')
      .in('retailer_id', slice);
    if (error) {
      console.error(error.message);
      process.exit(1);
    }
    for (const row of data ?? []) {
      if (typeof row.retailer_id === 'number') already.add(row.retailer_id);
    }
  }

  const toOpen = candidates.filter((c) => !already.has(c.id));

  const byTerritory = new Map<string, number>();
  const byRegion = new Map<string, number>();
  for (const c of toOpen) {
    byTerritory.set(c.territoryCode, (byTerritory.get(c.territoryCode) ?? 0) + 1);
    const key = `${c.territoryCode}/${c.region || '(blank)'}`;
    byRegion.set(key, (byRegion.get(key) ?? 0) + 1);
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        lineId: line.id,
        candidates: candidates.length,
        alreadyHaveLisRla: already.size,
        toOpen: toOpen.length,
        byTerritory: Object.fromEntries([...byTerritory.entries()].sort()),
        byRegionTop: Object.fromEntries(
          [...byRegion.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
        ),
        sample: toOpen.slice(0, SAMPLE).map((c) => ({
          id: c.id,
          name: c.name,
          city: c.city,
          region: c.region,
          territory: c.territoryCode,
          fitScore: c.fitScore,
          priority: c.priority,
        })),
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to open LIS RLAs.');
    return;
  }

  let opened = 0;
  let skipped = 0;
  let failed = 0;
  for (const c of toOpen) {
    const { error } = await client.from('retailer_line_accounts').insert({
      retailer_id: c.id,
      sales_line_id: line.id,
      relationship_status: 'prospect',
    });
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        skipped += 1;
        continue;
      }
      failed += 1;
      console.error(`Failed ${c.id} ${c.name}: ${error.message}`);
      continue;
    }
    opened += 1;
  }

  console.log(JSON.stringify({ opened, skipped, failed }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
