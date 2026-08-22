import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { getOperationalTerritoryReviewCount } from '@/lib/operationalTerritories/reviewApi';
import { jsonOpsReview } from '@/lib/operationalTerritories/reviewHttp';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const result = await getOperationalTerritoryReviewCount(gate.supabase);
  if (!result.ok) return jsonOpsReview({ ok: false, error: result.error }, 500);
  return jsonOpsReview({ ok: true, count: result.count });
};
