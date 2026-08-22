import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { checkAgentRateLimit, rateLimitResponse } from '@/lib/agentRateLimit';
import { gateStaffAiContext, parseOptionalUuidField } from '@/lib/aiLineContext';
import { createEnrichedProspect } from '@/lib/createEnrichedProspect';

export const prerender = false;
export const maxDuration = 60;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const gate = await requireApprovedStaffClient(request);
    if (!gate.ok) return gate.response;

    // createEnrichedProspect calls generateObject (paid gpt-4o via AI Gateway) per request.
    // Throttle per user (in-memory) like /api/agent; use a separate key so the two paid
    // endpoints don't share/starve one another's budget.
    const limited = checkAgentRateLimit(`enrich:${gate.userId}`);
    if (!limited.ok) {
      return rateLimitResponse(limited.retryAfterSec);
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonError('Invalid JSON body', 400);
    }

    const companyName = optionalString(body.companyName) ?? '';
    if (!companyName) {
      return jsonError('Company name is required', 400);
    }

    const gated = await gateStaffAiContext({
      client: gate.supabase,
      salesLineId: parseOptionalUuidField(body.salesLineId),
      kind: 'line_level',
    });
    if (!gated.ok) {
      return jsonError(gated.error, gated.status);
    }

    const result = await createEnrichedProspect(gate.supabase, {
      companyName,
      websiteUrl: optionalString(body.websiteUrl),
      contactName: optionalString(body.contactName),
      phone: optionalString(body.phone),
      email: optionalString(body.email),
      city: optionalString(body.city),
      retailChannelHint: optionalString(body.retailChannelHint),
      territoryCode: optionalString(body.territoryCode),
      salesLineId: gated.ctx?.salesLineId,
      lineCode: gated.ctx?.code,
      aiPersona: gated.ctx?.aiProfile.persona,
    });
    if (!result.ok) {
      return jsonError(result.error, 422);
    }

    return new Response(JSON.stringify({ ok: true, prospect: result.prospect }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Enrichment failed';
    return jsonError(message, 500);
  }
};
