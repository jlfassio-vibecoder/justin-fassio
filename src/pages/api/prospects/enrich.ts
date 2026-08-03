import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { createEnrichedProspect } from '@/lib/createEnrichedProspect';

export const prerender = false;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  let body: { companyName?: unknown; websiteUrl?: unknown };
  try {
    body = (await request.json()) as { companyName?: unknown; websiteUrl?: unknown };
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
  if (!companyName) {
    return jsonError('Company name is required', 400);
  }

  const websiteUrl =
    typeof body.websiteUrl === 'string' && body.websiteUrl.trim()
      ? body.websiteUrl.trim()
      : undefined;

  const result = await createEnrichedProspect(gate.supabase, { companyName, websiteUrl });
  if (!result.ok) {
    return jsonError(result.error, 502);
  }

  return new Response(JSON.stringify({ ok: true, prospect: result.prospect }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
