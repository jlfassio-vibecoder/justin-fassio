import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { assignOperationalTerritory } from '@/lib/operationalTerritories/reviewApi';
import { jsonOpsReview, parseProspectIdParam } from '@/lib/operationalTerritories/reviewHttp';
import { isUuid } from '@/lib/resolveSalesLineQuery';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const prospectId = parseProspectIdParam(params.prospectId);
  if (!prospectId) return jsonOpsReview({ ok: false, error: 'Invalid prospect id' }, 400);

  let body: { operationalTerritoryId?: string };
  try {
    body = (await request.json()) as { operationalTerritoryId?: string };
  } catch {
    return jsonOpsReview({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const operationalTerritoryId = body.operationalTerritoryId?.trim() ?? '';
  if (!operationalTerritoryId || !isUuid(operationalTerritoryId)) {
    return jsonOpsReview({ ok: false, error: 'operationalTerritoryId is required' }, 400);
  }

  const result = await assignOperationalTerritory(
    gate.supabase,
    prospectId,
    operationalTerritoryId,
    gate.userId,
  );
  if (!result.ok) return jsonOpsReview({ ok: false, error: result.error }, result.status);
  return jsonOpsReview({
    ok: true,
    prospect: result.prospect,
    auditWarning: result.auditWarning,
    reviewWarning: result.reviewWarning,
  });
};
