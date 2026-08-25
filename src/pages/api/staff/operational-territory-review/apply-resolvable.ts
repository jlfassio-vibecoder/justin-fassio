import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { applyResolvableOperationalTerritorySuggestionsForStore } from '@/lib/operationalTerritories/reviewApi';
import { jsonOpsReview } from '@/lib/operationalTerritories/reviewHttp';

export const prerender = false;
export const maxDuration = 300;

export const POST: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return jsonOpsReview({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const storeTerritoryCode =
    typeof body.storeTerritoryCode === 'string' ? body.storeTerritoryCode.trim() : '';
  if (!storeTerritoryCode) {
    return jsonOpsReview({ ok: false, error: 'storeTerritoryCode is required' }, 400);
  }

  const result = await applyResolvableOperationalTerritorySuggestionsForStore(
    gate.supabase,
    storeTerritoryCode,
    gate.userId,
  );
  if (!result.ok) return jsonOpsReview({ ok: false, error: result.error }, 400);
  return jsonOpsReview({
    ok: true,
    applied: result.applied,
    skipped: result.skipped,
    failures: result.failures,
  });
};
