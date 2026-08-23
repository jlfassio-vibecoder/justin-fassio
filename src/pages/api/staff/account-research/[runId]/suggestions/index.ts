import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { jsonAccountResearch } from '@/lib/accountResearch/http';
import { loadRunSuggestions } from '@/lib/accountResearch/suggestions';
import { isUuid } from '@/lib/resolveSalesLineQuery';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const auth = await requireApprovedStaffClient(request);
  if (!auth.ok) return auth.response;

  const runId = params.runId;
  if (!runId || !isUuid(runId)) {
    return jsonAccountResearch({ ok: false, error: 'Invalid runId' }, 400);
  }

  const loaded = await loadRunSuggestions(auth.supabase, runId);
  if (!loaded.ok) {
    return jsonAccountResearch({ ok: false, error: loaded.error }, 500);
  }

  return jsonAccountResearch({ ok: true, suggestions: loaded.suggestions });
};
