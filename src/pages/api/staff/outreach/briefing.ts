import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { assembleOutreachBriefing } from '@/lib/outreachBriefing';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const assembled = await assembleOutreachBriefing({ client: gate.supabase });
  if (!assembled.ok) return json({ error: assembled.error }, 500);

  return json({ briefing: assembled.briefing });
};
