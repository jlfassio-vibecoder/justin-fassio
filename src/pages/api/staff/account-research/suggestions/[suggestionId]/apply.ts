import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import {
  applyAccountResearchSuggestion,
  loadProspectAfterApply,
} from '@/lib/accountResearch/applySuggestion';
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

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return jsonAccountResearch({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  let confirmVerifiedOverwrite = false;
  if (record.confirmVerifiedOverwrite !== undefined) {
    if (record.confirmVerifiedOverwrite === true) confirmVerifiedOverwrite = true;
    else if (record.confirmVerifiedOverwrite === false) confirmVerifiedOverwrite = false;
    else {
      return jsonAccountResearch(
        { ok: false, error: 'confirmVerifiedOverwrite must be a boolean' },
        400,
      );
    }
  }

  const result = await applyAccountResearchSuggestion({
    supabase: auth.supabase,
    suggestionId,
    confirmVerifiedOverwrite,
  });

  if (!result.ok) {
    return jsonAccountResearch(
      { ok: false, outcome: result.outcome, error: result.error },
      result.status,
    );
  }

  const prospect = await loadProspectAfterApply(auth.supabase, result.retailerId);
  return jsonAccountResearch({
    ok: true,
    outcome: result.outcome,
    prospect,
  });
};
