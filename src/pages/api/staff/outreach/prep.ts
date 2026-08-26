import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { fetchOperationalTerritories } from '@/lib/operationalTerritories/fetchOperationalTerritories';
import { ogrMayConsumeOperationalTerritory } from '@/lib/operationalTerritories/resolve';
import { getOutreachGoalSettings } from '@/lib/outreachGoals';
import {
  briefingSellingDate,
  OUTREACH_REGIONAL_PREP_DEFAULT_LIMIT,
  OUTREACH_REGIONAL_PREP_MAX_LIMIT,
  runOutreachNightlyPrep,
} from '@/lib/outreachNightlyPrep';
import { normalizePrepCrmRegion } from '@/lib/geoCatalog';
import { formatOutreachPreparationDate } from '@/lib/outreachSelectTargets';
import { isWeekdayIso } from '@/lib/outreachSellingDays';

export const prerender = false;
export const maxDuration = 300;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const goals = await getOutreachGoalSettings(gate.supabase);
  if (!goals.ok) return json({ error: goals.error }, 500);
  const timeZone = goals.settings.businessTimezone;
  const asOf = new Date();
  const today = formatOutreachPreparationDate(asOf, timeZone);
  const defaultRegionalDate = briefingSellingDate(asOf, timeZone);

  const operationalTerritoryId =
    typeof body.operationalTerritoryId === 'string' ? body.operationalTerritoryId.trim() : '';
  const storeRaw =
    typeof body.storeTerritoryCode === 'string' ? body.storeTerritoryCode.trim().toLowerCase() : '';
  const storeTerritoryCode = storeRaw || null;
  const crmRegionRaw = typeof body.crmRegion === 'string' ? body.crmRegion.trim() : '';

  if (storeTerritoryCode && !['or', 'wa'].includes(storeTerritoryCode)) {
    return json({ error: 'storeTerritoryCode must be "or" or "wa" when set' }, 400);
  }

  if (operationalTerritoryId) {
    const ops = await fetchOperationalTerritories(gate.supabase);
    if (ops.error) return json({ error: ops.error }, 500);
    const match = ops.data.find((row) => row.id === operationalTerritoryId);
    if (!match) {
      return json({ error: 'Unknown or inactive operational territory' }, 400);
    }
    if (!ogrMayConsumeOperationalTerritory(match.code)) {
      return json({ error: `OGR prep does not support ops territory ${match.code}` }, 400);
    }
  }

  let preparationDate: string | undefined;
  const raw = typeof body.preparationDate === 'string' ? body.preparationDate.trim() : '';
  if (raw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return json({ error: 'preparationDate must be YYYY-MM-DD' }, 400);
    }
    if (raw === today && !isWeekdayIso(today)) {
      return json({ error: 'Today is not a selling day' }, 400);
    }
    preparationDate = raw;
  } else if (operationalTerritoryId) {
    preparationDate = defaultRegionalDate;
  } else {
    // Legacy nightly-style manual without region: keep next-day default
    preparationDate = undefined;
  }

  let limit: number | undefined;
  if (operationalTerritoryId) {
    if (typeof body.limit === 'number' && Number.isFinite(body.limit)) {
      limit = Math.floor(body.limit);
    } else {
      limit = OUTREACH_REGIONAL_PREP_DEFAULT_LIMIT;
    }
    if (limit < 1 || limit > OUTREACH_REGIONAL_PREP_MAX_LIMIT) {
      return json(
        { error: `limit must be between 1 and ${OUTREACH_REGIONAL_PREP_MAX_LIMIT}` },
        400,
      );
    }
  }

  const result = await runOutreachNightlyPrep({
    client: gate.supabase,
    trigger: 'manual',
    triggeredBy: gate.userId,
    preparationDate,
    asOf,
    operationalTerritoryId: operationalTerritoryId || undefined,
    storeTerritoryCode,
    crmRegion: normalizePrepCrmRegion(crmRegionRaw || null),
    limit,
  });

  if (!result.ok) {
    return json({ error: result.error, run: result.run ?? null }, result.status ?? 500);
  }

  return json({ ok: true, noop: result.noop, run: result.run });
};
