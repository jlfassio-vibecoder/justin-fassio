import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { dismissResearchQueueProspect } from '@/lib/outreachResearchQueueDismiss';

export const prerender = false;

/** Dismiss a prospect from the Briefing research-email queue. */
export const POST: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const prospectId = body.prospectId;
  if (typeof prospectId !== 'number' || !Number.isFinite(prospectId) || prospectId <= 0) {
    return new Response(JSON.stringify({ error: 'prospectId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await dismissResearchQueueProspect(gate.supabase, prospectId, {
    dismissedBy: gate.userId,
  });
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
