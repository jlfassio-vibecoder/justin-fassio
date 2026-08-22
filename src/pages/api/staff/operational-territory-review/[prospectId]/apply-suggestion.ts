import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { applyOperationalTerritorySuggestion } from '@/lib/operationalTerritories/reviewApi';
import { jsonOpsReview, parseProspectIdParam } from '@/lib/operationalTerritories/reviewHttp';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const prospectId = parseProspectIdParam(params.prospectId);
  if (!prospectId) return jsonOpsReview({ ok: false, error: 'Invalid prospect id' }, 400);

  const result = await applyOperationalTerritorySuggestion(gate.supabase, prospectId, gate.userId);
  if (!result.ok) return jsonOpsReview({ ok: false, error: result.error }, result.status);
  return jsonOpsReview({
    ok: true,
    prospect: result.prospect,
    auditWarning: result.auditWarning,
    reviewWarning: result.reviewWarning,
  });
};
