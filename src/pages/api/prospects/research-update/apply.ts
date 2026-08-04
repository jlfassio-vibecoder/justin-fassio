import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { applyProspectResearchUpdate } from '@/lib/updateProspectResearch';

export const prerender = false;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** AI Update Research / Fill Blank Fields — apply confirmed fields after preview. */
export const POST: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  let body: { prospectId?: unknown; fields?: unknown; mode?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const prospectId =
    typeof body.prospectId === 'number' && Number.isFinite(body.prospectId)
      ? body.prospectId
      : typeof body.prospectId === 'string' && body.prospectId.trim()
        ? Number(body.prospectId)
        : NaN;

  if (!Number.isFinite(prospectId)) {
    return jsonError('Prospect id is required', 400);
  }

  if (!body.fields || typeof body.fields !== 'object') {
    return jsonError('Fields are required', 400);
  }

  const mode = body.mode === 'fill-blanks' ? 'fill-blanks' : 'update';

  const result = await applyProspectResearchUpdate(gate.supabase, {
    id: prospectId,
    fields: body.fields as Parameters<typeof applyProspectResearchUpdate>[1]['fields'],
    mode,
  });
  if (!result.ok) {
    return jsonError(result.error, 502);
  }

  return new Response(JSON.stringify({ ok: true, prospect: result.prospect }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
