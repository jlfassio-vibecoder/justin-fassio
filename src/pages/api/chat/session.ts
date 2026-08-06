import type { APIRoute } from 'astro';
import { requireChatVisitorClient } from '@/lib/chatVisitorAuth';
import { checkChatRateLimit } from '@/lib/chatRateLimit';
import { rateLimitResponse } from '@/lib/agentRateLimit';
import { createEphemeralChatUser } from '@/lib/liveChatAuth';
import { ensureLiveChatThread } from '@/lib/liveChat';
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
  const limited = checkChatRateLimit(`chat-session:${clientKey(request)}`);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

  let body: { name?: unknown; email?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const contactEmail = typeof body.email === 'string' ? body.email.trim() : '';
  if (!name || name.length > 120) return json({ ok: false, error: 'Name is required' }, 400);
  if (contactEmail && (!contactEmail.includes('@') || contactEmail.length > 200)) {
    return json({ ok: false, error: 'Enter a valid email or leave it blank' }, 400);
  }

  const admin = getServiceRoleClient();
  if (!admin) {
    return json({ ok: false, error: 'Chat is not configured' }, 503);
  }

  const gate = await requireChatVisitorClient(request);
  let userId: string;
  let credentials: { email: string; password: string } | null = null;

  if (gate.ok) {
    userId = gate.userId;
  } else {
    const created = await createEphemeralChatUser(admin);
    if (!created.ok) return json({ ok: false, error: created.error }, 500);
    userId = created.credentials.userId;
    credentials = {
      email: created.credentials.email,
      password: created.credentials.password,
    };
  }

  const result = await ensureLiveChatThread(admin, {
    userId,
    name,
    email: contactEmail,
  });
  if (!result.ok) return json({ ok: false, error: result.error }, 500);

  return json({
    ok: true,
    threadId: result.thread.id,
    chatState: result.thread.chatState,
    subject: result.thread.subject,
    credentials,
  });
};
