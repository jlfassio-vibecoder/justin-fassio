import type { APIRoute } from 'astro';
import { requireChatVisitorClient } from '@/lib/chatVisitorAuth';
import { checkChatRateLimit } from '@/lib/chatRateLimit';
import { rateLimitResponse } from '@/lib/agentRateLimit';
import { insertVisitorMessage, sendLiveChatStaffAlert } from '@/lib/liveChat';
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
  const limited = checkChatRateLimit(`chat-msg:${clientKey(request)}`);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

  const gate = await requireChatVisitorClient(request);
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

  const admin = getServiceRoleClient();
  if (!admin) return json({ ok: false, error: 'Chat is not configured' }, 503);

  const result = await insertVisitorMessage(admin, {
    threadId,
    userId: gate.userId,
    body: text,
  });
  if (!result.ok) return json({ ok: false, error: result.error }, 400);

  if (result.firstMessage) {
    const { data: thread } = await admin
      .from('message_threads')
      .select('visitor_name, visitor_email')
      .eq('id', threadId)
      .maybeSingle();
    void sendLiveChatStaffAlert({
      threadId,
      visitorName: thread?.visitor_name ?? 'Visitor',
      visitorEmail: thread?.visitor_email ?? '',
      preview: text.trim(),
    });
  }

  return json({ ok: true, messageId: result.messageId });
};
