import type { APIRoute } from 'astro';
import { checkAgentRateLimit, rateLimitResponse } from '@/lib/agentRateLimit';
import { gateStaffAiContext } from '@/lib/aiLineContext';
import { jsonLookalike, parseLookalikeJson, requireLookalikeJob } from '@/lib/lookalike/http';
import { processLookalikeJob } from '@/lib/lookalike/jobs';

export const prerender = false;
export const maxDuration = 60;

export const POST: APIRoute = async ({ request, params }) => {
  const parsed = await parseLookalikeJson(request);
  if (!parsed.ok) return parsed.response;
  const gate = await requireLookalikeJob(request, params, parsed.body.sales_line_id);
  if (!gate.ok) return gate.response;

  const limited = checkAgentRateLimit(`lookalike:${gate.userId}`);
  if (!limited.ok) {
    return rateLimitResponse(limited.retryAfterSec);
  }

  const gated = await gateStaffAiContext({
    client: gate.supabase,
    salesLineId: gate.salesLineId,
    kind: 'line_level',
  });
  if (!gated.ok) {
    return jsonLookalike({ ok: false, error: gated.error }, gated.status);
  }

  const result = await processLookalikeJob(gate.supabase, gate.jobId);
  if (!result.ok) return jsonLookalike({ ok: false, error: result.error }, result.status);
  return jsonLookalike({ ok: true, snapshot: result.snapshot });
};
