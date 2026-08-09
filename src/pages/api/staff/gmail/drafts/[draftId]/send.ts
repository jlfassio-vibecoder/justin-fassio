import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import {
  accessTokenErrorToHttp,
  getGoogleAccessTokenForProfile,
  GoogleAccessTokenError,
} from '@/lib/google/accessToken';
import { GmailClientError } from '@/lib/google/gmailClient';
import { sendGmailDraft } from '@/lib/google/gmailSend';
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

  const draftId = typeof params.draftId === 'string' ? params.draftId.trim() : '';
  if (!draftId) return json({ ok: false, error: 'draftId is required' }, 400);

  const admin = getServiceRoleClient();
  if (!admin) return json({ ok: false, error: 'Server misconfigured' }, 500);

  try {
    const { accessToken } = await getGoogleAccessTokenForProfile({
      profileId: gate.userId,
      requireGmailReadonly: true,
      requireGmailCompose: true,
      client: admin,
    });
    const result = await sendGmailDraft({ accessToken, draftId });
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
    if (err instanceof GmailClientError) {
      console.error('[gmail]', { workflow: 'send_draft', error: 'gmail_failed' });
      return json({ ok: false, error: 'Failed to send Gmail draft' }, 502);
    }
    console.error('[gmail]', { workflow: 'send_draft', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to send Gmail draft' }, 500);
  }
};
