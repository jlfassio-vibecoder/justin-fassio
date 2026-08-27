import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { checkAgentRateLimit, rateLimitResponse } from '@/lib/agentRateLimit';
import { jsonAccountResearch, snapshotPayload } from '@/lib/accountResearch/http';
import { verifyYelpDirectoryMatchOnRun } from '@/lib/accountResearch/verifyYelpDirectoryMatch';
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

  const result = await verifyYelpDirectoryMatchOnRun(auth.supabase, runId);
  if (!result.ok) {
    const status =
      result.code === 'no_key' || result.code === 'low_confidence' || result.code === 'no_match'
        ? 409
        : result.code === 'run_not_found'
          ? 404
          : 502;
    return jsonAccountResearch(
      {
        ok: false,
        error: result.error,
        code: result.code,
        match: result.match ?? null,
      },
      status,
    );
  }

  return jsonAccountResearch({
    ok: true,
    match: {
      businessName: result.match.business.name,
      confidence: result.match.confidence,
      matchMethod: result.match.matchMethod,
      score: result.match.score,
      listingUrl: result.match.business.url,
      categories: result.match.business.categories,
    },
    citationIds: result.citationIds,
    ...snapshotPayload(result.snapshot),
  });
};
