import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import {
  accessTokenErrorToHttp,
  getGoogleAccessTokenForProfile,
  GoogleAccessTokenError,
} from '@/lib/google/accessToken';
import { getGmailThread, GmailClientError } from '@/lib/google/gmailClient';
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

  const threadId = typeof params.threadId === 'string' ? params.threadId.trim() : '';
  if (!threadId) {
    return json({ ok: false, error: 'threadId is required' }, 400);
  }

  const admin = getServiceRoleClient();
  if (!admin) {
    return json({ ok: false, error: 'Server misconfigured' }, 500);
  }

  try {
    const { accessToken } = await getGoogleAccessTokenForProfile({
      profileId: gate.userId,
      requireGmailReadonly: true,
      client: admin,
    });
    const thread = await getGmailThread({ accessToken, threadId });
    return json({ ok: true, thread });
  } catch (err) {
    if (err instanceof GoogleAccessTokenError) {
      const mapped = accessTokenErrorToHttp(err);
      return json(mapped.body, mapped.status);
    }
    if (err instanceof GmailClientError) {
      console.error('[gmail]', { workflow: 'get_thread', error: 'gmail_failed' });
      return json({ ok: false, error: 'Failed to load Gmail thread' }, 502);
    }
    console.error('[gmail]', { workflow: 'get_thread', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to load Gmail thread' }, 500);
  }
};
