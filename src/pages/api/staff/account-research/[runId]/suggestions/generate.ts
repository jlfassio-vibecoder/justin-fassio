import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { jsonAccountResearch } from '@/lib/accountResearch/http';
import { generateAccountResearchSuggestions } from '@/lib/accountResearch/suggestions';
import { isUuid } from '@/lib/resolveSalesLineQuery';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const auth = await requireApprovedStaffClient(request);
  if (!auth.ok) return auth.response;

  const runId = params.runId;
  if (!runId || !isUuid(runId)) {
    return jsonAccountResearch({ ok: false, error: 'Invalid runId' }, 400);
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return jsonAccountResearch({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  let forceRegenerate = false;
  if (record.forceRegenerate !== undefined) {
    if (record.forceRegenerate === true) forceRegenerate = true;
    else if (record.forceRegenerate === false) forceRegenerate = false;
    else {
      return jsonAccountResearch({ ok: false, error: 'forceRegenerate must be a boolean' }, 400);
    }
  }

  const result = await generateAccountResearchSuggestions({
    supabase: auth.supabase,
    runId,
    forceRegenerate,
  });

  if (!result.ok) {
    return jsonAccountResearch(
      { ok: false, outcome: result.outcome, error: result.error },
      result.status,
    );
  }

  return jsonAccountResearch({
    ok: true,
    outcome: result.outcome,
    suggestions: result.suggestions,
  });
};
