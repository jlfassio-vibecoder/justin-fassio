import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { checkAgentRateLimit, rateLimitResponse } from '@/lib/agentRateLimit';
import { jsonAccountResearch, snapshotPayload } from '@/lib/accountResearch/http';
import { processNextAccountResearchSource } from '@/lib/accountResearch/orchestrate';
import { isUuid } from '@/lib/resolveSalesLineQuery';

export const prerender = false;
export const maxDuration = 60;

export const POST: APIRoute = async ({ request, params }) => {
  const auth = await requireApprovedStaffClient(request);
  if (!auth.ok) return auth.response;

  const limited = checkAgentRateLimit(`account-research:${auth.userId}`);
  if (!limited.ok) {
    return rateLimitResponse(limited.retryAfterSec);
  }

  const runId = params.runId;
  if (!runId || !isUuid(runId)) {
    return jsonAccountResearch({ ok: false, error: 'Invalid runId' }, 400);
  }

  const result = await processNextAccountResearchSource({
    supabase: auth.supabase,
    runId,
  });

  if (!result.ok) {
    return jsonAccountResearch({ ok: false, error: result.error }, result.status);
  }

  return jsonAccountResearch({
    ok: true,
    processed: result.processed,
    sourceId: result.sourceId,
    done: result.done,
    ...snapshotPayload(result.snapshot),
  });
};
