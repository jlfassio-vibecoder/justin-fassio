import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { assembleOutreachBriefing } from '@/lib/outreachBriefing';
import { resolveSalesLineQuery } from '@/lib/resolveSalesLineQuery';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ request, url }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const search = url?.searchParams ?? new URL(request.url).searchParams;
  const resolved = await resolveSalesLineQuery(
    gate.supabase,
    search.get('sales_line_id') ?? search.get('line'),
  );
  if (!resolved.ok) {
    return json({ error: resolved.error }, resolved.status);
  }

  const operationalTerritoryId = search.get('operational_territory_id')?.trim() || '';
  const storeTerritoryCode = search.get('store_territory_code')?.trim().toLowerCase() || '';
  const crmRegion = search.get('crm_region')?.trim() || '';
  const city = search.get('city')?.trim() || '';

  const assembled = await assembleOutreachBriefing({
    client: gate.supabase,
    salesLineId: resolved.line?.id ?? null,
    salesLineCode: resolved.line?.code ?? null,
    regionalPrepScope: operationalTerritoryId
      ? {
          operationalTerritoryId,
          storeTerritoryCode: storeTerritoryCode || null,
          crmRegion: crmRegion || null,
          city: city || null,
        }
      : undefined,
  });
  if (!assembled.ok) return json({ error: assembled.error }, 500);

  return json({ briefing: assembled.briefing });
};
