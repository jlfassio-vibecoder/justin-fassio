import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { jsonOpsReview } from '@/lib/operationalTerritories/reviewHttp';
import { listOperationalTerritoryReviews } from '@/lib/operationalTerritories/reviewApi';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const result = await listOperationalTerritoryReviews(gate.supabase);
  if (!result.ok) return jsonOpsReview({ ok: false, error: result.error }, 500);
  return jsonOpsReview({ ok: true, items: result.items });
};
