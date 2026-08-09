import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import {
  accessTokenErrorToHttp,
  getGoogleAccessTokenForProfile,
  GoogleAccessTokenError,
} from '@/lib/google/accessToken';
import { GmailClientError } from '@/lib/google/gmailClient';
import { gmailClientErrorJsonResponse } from '@/lib/google/gmailErrors';
import { downloadGmailAttachment } from '@/lib/google/gmailSend';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ request, params }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const messageId = typeof params.messageId === 'string' ? params.messageId.trim() : '';
  const attachmentId = typeof params.attachmentId === 'string' ? params.attachmentId.trim() : '';
  if (!messageId || !attachmentId) {
    return json({ ok: false, error: 'messageId and attachmentId are required' }, 400);
  }

  const admin = getServiceRoleClient();
  if (!admin) return json({ ok: false, error: 'Server misconfigured' }, 500);

  try {
    const { accessToken } = await getGoogleAccessTokenForProfile({
      profileId: gate.userId,
      requireGmailReadonly: true,
      client: admin,
    });
    const { data } = await downloadGmailAttachment({
      accessToken,
      messageId,
      attachmentId,
    });
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(data.length),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    if (err instanceof GoogleAccessTokenError) {
      const mapped = accessTokenErrorToHttp(err);
      return json(mapped.body, mapped.status);
    }
    if (err instanceof GmailClientError) {
      return gmailClientErrorJsonResponse(
        'attachment_download',
        err,
        'Failed to download attachment',
      );
    }
    console.error('[gmail]', { workflow: 'attachment_download', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to download attachment' }, 500);
  }
};
