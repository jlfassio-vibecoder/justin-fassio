import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import {
  accessTokenErrorToHttp,
  getGoogleAccessTokenForProfile,
  GoogleAccessTokenError,
} from '@/lib/google/accessToken';
import { GmailClientError } from '@/lib/google/gmailClient';
import { parseComposeRequestBody } from '@/lib/google/gmailComposeValidation';
import { gmailClientErrorJsonResponse } from '@/lib/google/gmailErrors';
import { GmailMimeError } from '@/lib/google/gmailMime';
import { sendGmailMessage } from '@/lib/google/gmailSend';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const admin = getServiceRoleClient();
  if (!admin) {
    return json({ ok: false, error: 'Server misconfigured' }, 500);
  }

  let parsed;
  try {
    parsed = parseComposeRequestBody(await request.json());
  } catch (err) {
    if (err instanceof GmailMimeError) {
      return json({ ok: false, error: err.message }, 400);
    }
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  if (parsed.to.length === 0) {
    return json({ ok: false, error: 'At least one To recipient is required' }, 400);
  }

  try {
    const { accessToken } = await getGoogleAccessTokenForProfile({
      profileId: gate.userId,
      requireGmailReadonly: true,
      requireGmailCompose: true,
      client: admin,
    });
    const result = await sendGmailMessage({
      accessToken,
      to: parsed.to,
      cc: parsed.cc.length ? parsed.cc : undefined,
      bcc: parsed.bcc.length ? parsed.bcc : undefined,
      subject: parsed.subject,
      bodyText: parsed.bodyText,
      threadId: parsed.threadId,
    });
    return json({
      ok: true,
      messageId: result.id,
      threadId: result.threadId,
    });
  } catch (err) {
    if (err instanceof GoogleAccessTokenError) {
      const mapped = accessTokenErrorToHttp(err);
      return json(mapped.body, mapped.status);
    }
    if (err instanceof GmailMimeError) {
      return json({ ok: false, error: err.message }, 400);
    }
    if (err instanceof GmailClientError) {
      return gmailClientErrorJsonResponse('send', err, 'Failed to send Gmail message');
    }
    console.error('[gmail]', { workflow: 'send', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to send Gmail message' }, 500);
  }
};
