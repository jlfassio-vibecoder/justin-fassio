import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { rejectAccountResearchSuggestion } from '@/lib/accountResearch/applySuggestion';
import { jsonAccountResearch } from '@/lib/accountResearch/http';
import { isUuid } from '@/lib/resolveSalesLineQuery';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const auth = await requireApprovedStaffClient(request);
  if (!auth.ok) return auth.response;

  const suggestionId = params.suggestionId;
  if (!suggestionId || !isUuid(suggestionId)) {
    return jsonAccountResearch({ ok: false, error: 'Invalid suggestionId' }, 400);
  }

  const result = await rejectAccountResearchSuggestion({
    supabase: auth.supabase,
    suggestionId,
  });

  if (!result.ok) {
    return jsonAccountResearch(
      { ok: false, outcome: result.outcome, error: result.error },
      result.status,
    );
  }

  return jsonAccountResearch({ ok: true, outcome: result.outcome });
};
