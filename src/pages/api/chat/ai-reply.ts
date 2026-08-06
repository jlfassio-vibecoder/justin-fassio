import type { APIRoute } from 'astro';
import { requireChatVisitorClient } from '@/lib/chatVisitorAuth';
import { checkChatRateLimit } from '@/lib/chatRateLimit';
import { rateLimitResponse } from '@/lib/agentRateLimit';
import { generateAiChatReply } from '@/lib/liveChat';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function clientKey(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'anonymous'
  );
}

export const POST: APIRoute = async ({ request }) => {
  const limited = checkChatRateLimit(`chat-ai:${clientKey(request)}`);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

  const gate = await requireChatVisitorClient(request);
  if (!gate.ok) return gate.response;

  let body: { threadId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const threadId = typeof body.threadId === 'string' ? body.threadId : '';
  if (!threadId) return json({ ok: false, error: 'threadId is required' }, 400);

  const admin = getServiceRoleClient();
  if (!admin) return json({ ok: false, error: 'Chat is not configured' }, 503);

  const result = await generateAiChatReply(admin, { threadId, userId: gate.userId });
  if (!result.ok) {
    return json({ ok: false, error: result.error }, result.status ?? 502);
  }

  return json({ ok: true, body: result.body });
};
