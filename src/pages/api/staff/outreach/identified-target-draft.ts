import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { createOutreachIdentifiedTargetDraft } from '@/lib/createOutreachIdentifiedTargetDraft';
import { normalizePrepCity, normalizePrepCrmRegion } from '@/lib/geoCatalog';
import { fetchOperationalTerritories } from '@/lib/operationalTerritories/fetchOperationalTerritories';
import { ogrMayConsumeOperationalTerritory } from '@/lib/operationalTerritories/resolve';
import { getOutreachGoalSettings } from '@/lib/outreachGoals';
import { briefingSellingDate } from '@/lib/outreachNightlyPrep';
import { formatOutreachPreparationDate } from '@/lib/outreachSelectTargets';
import { isWeekdayIso } from '@/lib/outreachSellingDays';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Staff Briefing: draft one research-queue identified target using frozen product
 * + live contact email. Does not re-run regional prep. Never calls Resend.
 *
 * Body: { prospectId, catalogItemId, operationalTerritoryId,
 *   storeTerritoryCode?, crmRegion?, city?, preparationDate? }
 */
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

  const prospectId = body.prospectId;
  if (typeof prospectId !== 'number' || !Number.isFinite(prospectId) || prospectId <= 0) {
    return json({ error: 'prospectId is required' }, 400);
  }

  const catalogItemId = typeof body.catalogItemId === 'string' ? body.catalogItemId.trim() : '';
  if (!catalogItemId) {
    return json({ error: 'catalogItemId is required' }, 400);
  }

  const operationalTerritoryId =
    typeof body.operationalTerritoryId === 'string' ? body.operationalTerritoryId.trim() : '';
  if (!operationalTerritoryId) {
    return json({ error: 'operationalTerritoryId is required' }, 400);
  }

  const storeRaw =
    typeof body.storeTerritoryCode === 'string' ? body.storeTerritoryCode.trim().toLowerCase() : '';
  const storeTerritoryCode = storeRaw || null;
  if (storeTerritoryCode && !['or', 'wa'].includes(storeTerritoryCode)) {
    return json({ error: 'storeTerritoryCode must be "or" or "wa" when set' }, 400);
  }

  const crmRegionRaw = typeof body.crmRegion === 'string' ? body.crmRegion.trim() : '';
  const cityRaw = typeof body.city === 'string' ? body.city.trim() : '';

  const ops = await fetchOperationalTerritories(gate.supabase);
  if (ops.error) return json({ error: ops.error }, 500);
  const match = ops.data.find((row) => row.id === operationalTerritoryId);
  if (!match) {
    return json({ error: 'Unknown or inactive operational territory' }, 400);
  }
  if (!ogrMayConsumeOperationalTerritory(match.code)) {
    return json({ error: `OGR prep does not support ops territory ${match.code}` }, 400);
  }

  const goals = await getOutreachGoalSettings(gate.supabase);
  if (!goals.ok) return json({ error: goals.error }, 500);
  const timeZone = goals.settings.businessTimezone;
  const asOf = new Date();
  const today = formatOutreachPreparationDate(asOf, timeZone);
  const defaultRegionalDate = briefingSellingDate(asOf, timeZone);

  let preparationDate: string;
  const raw = typeof body.preparationDate === 'string' ? body.preparationDate.trim() : '';
  if (raw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return json({ error: 'preparationDate must be YYYY-MM-DD' }, 400);
    }
    if (raw === today && !isWeekdayIso(today)) {
      return json({ error: 'Today is not a selling day' }, 400);
    }
    preparationDate = raw;
  } else {
    preparationDate = defaultRegionalDate;
  }

  const created = await createOutreachIdentifiedTargetDraft({
    client: gate.supabase,
    prospectId,
    catalogItemId,
    operationalTerritoryId,
    storeTerritoryCode,
    crmRegion: normalizePrepCrmRegion(crmRegionRaw || null),
    city: normalizePrepCity(cityRaw || null),
    preparationDate,
    userId: gate.userId,
  });

  if (!created.ok) {
    if (created.status === 409 || created.status === 404 || created.status === 400) {
      return json({ error: created.error }, created.status);
    }
    return json({ error: created.error }, 502);
  }

  return json({
    ok: true,
    draftId: created.draftId,
    catalogItemId: created.catalogItemId,
    productName: created.productName,
    reusedPending: created.reusedPending,
  });
};
