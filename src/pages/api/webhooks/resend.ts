import type { APIRoute } from 'astro';
import {
  applyResendSystemMessageEvent,
  isHandledResendEventType,
  normalizeResendWebhookEvent,
  verifyResendWebhook,
} from '@/lib/resendWebhook';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function webhookSecret(): string | null {
  const secret =
    import.meta.env.RESEND_WEBHOOK_SECRET ?? process.env.RESEND_WEBHOOK_SECRET ?? null;
  if (!secret || secret === 'whsec_xxxxxxxxx') return null;
  return secret;
}

export const POST: APIRoute = async ({ request }) => {
  const secret = webhookSecret();
  if (!secret) {
    return json({ ok: false, error: 'Webhook is not configured' }, 503);
  }

  const admin = getServiceRoleClient();
  if (!admin) {
    return json({ ok: false, error: 'Service role is not configured' }, 503);
  }

  const rawBody = await request.text();
  let parsed: unknown;
  try {
    parsed = verifyResendWebhook({
      rawBody,
      headers: request.headers,
      secret,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid webhook';
    console.error('[resendWebhook]', { workflow: 'verify', error: message });
    return json({ ok: false, error: 'Invalid webhook signature' }, 400);
  }

  const svixId = request.headers.get('svix-id')?.trim() ?? '';
  if (!svixId) {
    return json({ ok: false, error: 'Missing svix-id' }, 400);
  }

  const normalized = normalizeResendWebhookEvent(parsed);
  if (!normalized) {
    console.error('[resendWebhook]', { workflow: 'normalize', error: 'Unrecognized payload' });
    return json({ ok: true, ignored: true, reason: 'unrecognized_payload' }, 200);
  }

  if (!isHandledResendEventType(normalized.type)) {
    return json({ ok: true, ignored: true, reason: 'unhandled_type' }, 200);
  }

  const result = await applyResendSystemMessageEvent(admin, {
    resendEventId: svixId,
    event: normalized,
  });

  if (!result.ok) {
    console.error('[resendWebhook]', {
      workflow: 'apply',
      error: result.error,
      emailId: normalized.emailId,
      type: normalized.type,
    });
    return json({ ok: false, error: 'Failed to apply webhook event' }, 500);
  }

  if (result.duplicate) {
    return json({ ok: true, duplicate: true }, 200);
  }

  if ('unknownEmail' in result && result.unknownEmail) {
    console.info('[resendWebhook]', {
      workflow: 'apply',
      ignored: 'unknown_email',
      emailId: normalized.emailId,
      type: normalized.type,
    });
    return json({ ok: true, unknownEmail: true }, 200);
  }

  return json(
    {
      ok: true,
      systemMessageId: 'systemMessageId' in result ? result.systemMessageId : undefined,
    },
    200,
  );
};
