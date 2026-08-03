import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { checkAgentRateLimit, rateLimitResponse } from '@/lib/agentRateLimit';
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

  const result = await researchUsdCadLandedFactors();
  if (!result.ok) {
    return jsonError(result.error, 502);
  }

  return new Response(JSON.stringify({ ok: true, rates: result.rates }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
