import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import {
  accessTokenErrorToHttp,
  getGoogleAccessTokenForProfile,
  GoogleAccessTokenError,
} from '@/lib/google/accessToken';
import { GmailClientError } from '@/lib/google/gmailClient';
import { parseReplyRequestBody } from '@/lib/google/gmailComposeValidation';
import { gmailClientErrorJsonResponse } from '@/lib/google/gmailErrors';
import { GmailMimeError } from '@/lib/google/gmailMime';
import { replyToGmailThread } from '@/lib/google/gmailSend';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, params }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const threadId = typeof params.threadId === 'string' ? params.threadId.trim() : '';
  if (!threadId) {
    return json({ ok: false, error: 'threadId is required' }, 400);
  }

  const admin = getServiceRoleClient();
  if (!admin) {
    return json({ ok: false, error: 'Server misconfigured' }, 500);
  }

  let parsed;
  try {
    parsed = parseReplyRequestBody(await request.json());
  } catch (err) {
    if (err instanceof GmailMimeError) {
      return json({ ok: false, error: err.message }, 400);
    }
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  try {
    const { accessToken, connection } = await getGoogleAccessTokenForProfile({
      profileId: gate.userId,
      requireGmailReadonly: true,
      requireGmailCompose: true,
      client: admin,
    });
    const result = await replyToGmailThread({
      accessToken,
      threadId,
      mode: parsed.mode,
      bodyText: parsed.bodyText,
      selfEmail: connection.google_email,
      messageId: parsed.messageId,
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
      return gmailClientErrorJsonResponse('reply', err, 'Failed to send Gmail reply');
    }
    console.error('[gmail]', { workflow: 'reply', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to send Gmail reply' }, 500);
  }
};
