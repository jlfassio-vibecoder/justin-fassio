import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { checkAgentRateLimit, rateLimitResponse } from '@/lib/agentRateLimit';
import { gateStaffAiContext, parseOptionalUuidField } from '@/lib/aiLineContext';
import { researchUsdCadLandedFactors } from '@/lib/landedRatesResearch';

export const prerender = false;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** AI Update for Line Sheet CAD landed factors (web research + structured rates). */
export const POST: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  // researchUsdCadLandedFactors uses Perplexity search + generateObject (paid via AI Gateway).
  const limited = checkAgentRateLimit(`landed-rates:${gate.userId}`);
  if (!limited.ok) {
    return rateLimitResponse(limited.retryAfterSec);
  }

  let body: { salesLineId?: unknown } = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === 'object') {
      body = parsed as { salesLineId?: unknown };
    }
  } catch {
    body = {};
  }

  const gated = await gateStaffAiContext({
    client: gate.supabase,
    salesLineId: parseOptionalUuidField(body.salesLineId),
    kind: 'line_level',
  });
  if (!gated.ok) {
    return jsonError(gated.error, gated.status);
  }

  const result = await researchUsdCadLandedFactors({
    lineCode: gated.ctx?.code,
    persona: gated.ctx?.aiProfile.persona,
  });
  if (!result.ok) {
    return jsonError(result.error, 502);
  }

  return new Response(JSON.stringify({ ok: true, rates: result.rates }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
