import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { insertStaffChatReply } from '@/lib/liveChat';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  let body: { threadId?: unknown; body?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const threadId = typeof body.threadId === 'string' ? body.threadId : '';
  const text = typeof body.body === 'string' ? body.body : '';
  if (!threadId) return json({ ok: false, error: 'threadId is required' }, 400);

  const result = await insertStaffChatReply(gate.supabase, { threadId, body: text });
  if (!result.ok) return json({ ok: false, error: result.error }, 400);

  return json({ ok: true, messageId: result.messageId });
};
