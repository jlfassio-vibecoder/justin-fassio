import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { gateStaffAiContext, parseOptionalUuidField } from '@/lib/aiLineContext';
import { previewEnrichedContactAttach } from '@/lib/createEnrichedContact';

export const prerender = false;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Contact discovery preview — proposed fields only (no write). */
export const POST: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  let body: {
    accountId?: unknown;
    candidateName?: unknown;
    resolvedWebsite?: unknown;
    salesLineId?: unknown;
    retailerLineAccountId?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const accountId =
    typeof body.accountId === 'number' && Number.isFinite(body.accountId)
      ? body.accountId
      : typeof body.accountId === 'string' && body.accountId.trim()
        ? Number(body.accountId)
        : NaN;

  if (!Number.isFinite(accountId)) {
    return jsonError('Account id is required', 400);
  }

  const candidateName =
    typeof body.candidateName === 'string' && body.candidateName.trim()
      ? body.candidateName.trim()
      : undefined;

  const resolvedWebsite =
    typeof body.resolvedWebsite === 'string' && body.resolvedWebsite.trim()
      ? body.resolvedWebsite.trim()
      : undefined;

  const gated = await gateStaffAiContext({
    client: gate.supabase,
    salesLineId: parseOptionalUuidField(body.salesLineId),
    retailerLineAccountId: parseOptionalUuidField(body.retailerLineAccountId),
    prospectId: accountId,
    kind: 'account',
  });
  if (!gated.ok) {
    return jsonError(gated.error, gated.status);
  }

  const result = await previewEnrichedContactAttach(gate.supabase, {
    accountId,
    candidateName,
    resolvedWebsite,
    aiPersona: gated.ctx?.aiProfile.persona,
  });
  if (!result.ok) {
    return jsonError(result.error, 502);
  }

  return new Response(JSON.stringify({ ok: true, preview: result.preview }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
