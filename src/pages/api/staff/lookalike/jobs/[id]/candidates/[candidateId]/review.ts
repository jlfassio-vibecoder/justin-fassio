import type { APIRoute } from 'astro';
import { jsonLookalike, parseLookalikeJson, requireLookalikeJob } from '@/lib/lookalike/http';
import { reviewLookalikeCandidate } from '@/lib/lookalike/jobs';
import { isUuid } from '@/lib/resolveSalesLineQuery';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const parsed = await parseLookalikeJson(request);
  if (!parsed.ok) return parsed.response;
  const gate = await requireLookalikeJob(request, params, parsed.body.sales_line_id);
  if (!gate.ok) return gate.response;

  const candidateId = typeof params.candidateId === 'string' ? params.candidateId.trim() : '';
  if (!candidateId || !isUuid(candidateId)) {
    return jsonLookalike({ ok: false, error: 'Invalid candidate id' }, 400);
  }
  const action =
    parsed.body.action === 'reject'
      ? 'reject'
      : parsed.body.action === 'approve'
        ? 'approve'
        : null;
  if (!action) {
    return jsonLookalike({ ok: false, error: 'action must be approve or reject' }, 400);
  }

  const result = await reviewLookalikeCandidate(gate.supabase, {
    jobId: gate.jobId,
    candidateId,
    action,
  });
  if (!result.ok) return jsonLookalike({ ok: false, error: result.error }, result.status);
  return jsonLookalike({ ok: true, snapshot: result.snapshot });
};
