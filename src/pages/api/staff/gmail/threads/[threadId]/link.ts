import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import {
  accessTokenErrorToHttp,
  getGoogleAccessTokenForProfile,
  GoogleAccessTokenError,
} from '@/lib/google/accessToken';
import { extractThreadParticipants, matchParticipantsToCrm } from '@/lib/google/crmEmailMatch';
import { GmailClientError, getGmailThread } from '@/lib/google/gmailClient';
import {
  deleteGmailThreadLink,
  getGmailThreadLink,
  GmailThreadLinkError,
  toPublicGmailThreadLink,
  upsertConfirmedGmailThreadLink,
} from '@/lib/google/gmailThreadLinks';
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
  if (!threadId) return json({ ok: false, error: 'threadId is required' }, 400);

  const admin = getServiceRoleClient();
  if (!admin) return json({ ok: false, error: 'Server misconfigured' }, 500);

  try {
    const { accessToken, connection } = await getGoogleAccessTokenForProfile({
      profileId: gate.userId,
      requireGmailReadonly: true,
      client: admin,
    });
    const thread = await getGmailThread({ accessToken, threadId });
    const participants = extractThreadParticipants(thread, connection.google_email);
    const suggestions = await matchParticipantsToCrm(gate.supabase, participants);
    const existing = await getGmailThreadLink({
      client: gate.supabase,
      googleConnectionId: connection.id,
      gmailThreadId: threadId,
    });

    return json({
      ok: true,
      threadId,
      participants: participants.map((p) => p.email),
      suggestions,
      link: existing ? toPublicGmailThreadLink(existing) : null,
    });
  } catch (err) {
    if (err instanceof GoogleAccessTokenError) {
      const mapped = accessTokenErrorToHttp(err);
      return json(mapped.body, mapped.status);
    }
    if (err instanceof GmailClientError) {
      console.error('[gmail]', { workflow: 'thread_link_get', error: 'gmail_failed' });
      return json({ ok: false, error: 'Failed to load Gmail link' }, 502);
    }
    if (err instanceof GmailThreadLinkError) {
      return json({ ok: false, error: err.message }, 500);
    }
    console.error('[gmail]', { workflow: 'thread_link_get', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to load Gmail link' }, 500);
  }
};

export const POST: APIRoute = async ({ request, params }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const threadId = typeof params.threadId === 'string' ? params.threadId.trim() : '';
  if (!threadId) return json({ ok: false, error: 'threadId is required' }, 400);

  let body: { prospectId?: unknown; accountContactId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const prospectId =
    typeof body.prospectId === 'number' ? body.prospectId : Number(body.prospectId);
  if (!Number.isFinite(prospectId) || prospectId <= 0) {
    return json({ ok: false, error: 'prospectId is required' }, 400);
  }
  const accountContactId =
    typeof body.accountContactId === 'string' && body.accountContactId.trim()
      ? body.accountContactId.trim()
      : null;

  const admin = getServiceRoleClient();
  if (!admin) return json({ ok: false, error: 'Server misconfigured' }, 500);

  try {
    const { accessToken, connection } = await getGoogleAccessTokenForProfile({
      profileId: gate.userId,
      requireGmailReadonly: true,
      client: admin,
    });
    const thread = await getGmailThread({ accessToken, threadId });
    const participants = extractThreadParticipants(thread, connection.google_email);
    const latestDate =
      thread.messages[thread.messages.length - 1]?.date ?? thread.messages[0]?.date ?? null;

    const row = await upsertConfirmedGmailThreadLink({
      client: gate.supabase,
      googleConnectionId: connection.id,
      gmailThreadId: threadId,
      prospectId,
      accountContactId,
      cache: {
        subject: thread.subject,
        snippet: thread.snippet,
        participants: participants.map((p) => p.email),
        unread: thread.unread,
        lastMessageAt: latestDate,
      },
    });

    return json({ ok: true, link: toPublicGmailThreadLink(row) });
  } catch (err) {
    if (err instanceof GoogleAccessTokenError) {
      const mapped = accessTokenErrorToHttp(err);
      return json(mapped.body, mapped.status);
    }
    if (err instanceof GmailClientError) {
      console.error('[gmail]', { workflow: 'thread_link_confirm', error: 'gmail_failed' });
      return json({ ok: false, error: 'Failed to link Gmail thread' }, 502);
    }
    if (err instanceof GmailThreadLinkError) {
      return json({ ok: false, error: err.message }, 400);
    }
    console.error('[gmail]', { workflow: 'thread_link_confirm', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to link Gmail thread' }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const threadId = typeof params.threadId === 'string' ? params.threadId.trim() : '';
  if (!threadId) return json({ ok: false, error: 'threadId is required' }, 400);

  const admin = getServiceRoleClient();
  if (!admin) return json({ ok: false, error: 'Server misconfigured' }, 500);

  try {
    const { connection } = await getGoogleAccessTokenForProfile({
      profileId: gate.userId,
      requireGmailReadonly: true,
      client: admin,
    });
    const deleted = await deleteGmailThreadLink({
      client: gate.supabase,
      googleConnectionId: connection.id,
      gmailThreadId: threadId,
    });
    return json({ ok: true, deleted });
  } catch (err) {
    if (err instanceof GoogleAccessTokenError) {
      const mapped = accessTokenErrorToHttp(err);
      return json(mapped.body, mapped.status);
    }
    if (err instanceof GmailThreadLinkError) {
      return json({ ok: false, error: err.message }, 500);
    }
    console.error('[gmail]', { workflow: 'thread_link_delete', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to unlink Gmail thread' }, 500);
  }
};
