import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { jsonAccountResearch, snapshotPayload } from '@/lib/accountResearch/http';
import { loadAccountResearchSnapshot } from '@/lib/accountResearch/snapshot';
import { isUuid } from '@/lib/resolveSalesLineQuery';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const auth = await requireApprovedStaffClient(request);
  if (!auth.ok) return auth.response;

  const runId = params.runId;
  if (!runId || !isUuid(runId)) {
    return jsonAccountResearch({ ok: false, error: 'Invalid runId' }, 400);
  }

  const snapshot = await loadAccountResearchSnapshot(auth.supabase, runId);
  if (!snapshot) {
    return jsonAccountResearch({ ok: false, error: 'Run not found' }, 404);
  }

  return jsonAccountResearch({
    ok: true,
    ...snapshotPayload(snapshot),
  });
};
