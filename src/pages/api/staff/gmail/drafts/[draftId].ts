import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import {
  accessTokenErrorToHttp,
  getGoogleAccessTokenForProfile,
  GoogleAccessTokenError,
} from '@/lib/google/accessToken';
import { GmailClientError } from '@/lib/google/gmailClient';
import { parseComposeRequestBody } from '@/lib/google/gmailComposeValidation';
import { GmailMimeError } from '@/lib/google/gmailMime';
import { deleteGmailDraft, getGmailDraft, updateGmailDraft } from '@/lib/google/gmailSend';
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
    const draft = await getGmailDraft({ accessToken, draftId });
    return json({ ok: true, draft });
  } catch (err) {
    if (err instanceof GoogleAccessTokenError) {
      const mapped = accessTokenErrorToHttp(err);
      return json(mapped.body, mapped.status);
    }
    if (err instanceof GmailClientError) {
      console.error('[gmail]', { workflow: 'get_draft', error: 'gmail_failed' });
      return json({ ok: false, error: 'Failed to load Gmail draft' }, 502);
    }
    console.error('[gmail]', { workflow: 'get_draft', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to load Gmail draft' }, 500);
  }
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const draftId = typeof params.draftId === 'string' ? params.draftId.trim() : '';
  if (!draftId) return json({ ok: false, error: 'draftId is required' }, 400);

  const admin = getServiceRoleClient();
  if (!admin) return json({ ok: false, error: 'Server misconfigured' }, 500);

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
    const draft = await updateGmailDraft({
      accessToken,
      draftId,
      to: parsed.to,
      cc: parsed.cc.length ? parsed.cc : undefined,
      bcc: parsed.bcc.length ? parsed.bcc : undefined,
      subject: parsed.subject,
      bodyText: parsed.bodyText,
      threadId: parsed.threadId,
    });
    return json({ ok: true, draft });
  } catch (err) {
    if (err instanceof GoogleAccessTokenError) {
      const mapped = accessTokenErrorToHttp(err);
      return json(mapped.body, mapped.status);
    }
    if (err instanceof GmailMimeError) {
      return json({ ok: false, error: err.message }, 400);
    }
    if (err instanceof GmailClientError) {
      console.error('[gmail]', { workflow: 'update_draft', error: 'gmail_failed' });
      return json({ ok: false, error: 'Failed to update Gmail draft' }, 502);
    }
    console.error('[gmail]', { workflow: 'update_draft', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to update Gmail draft' }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, params }) => {
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
    await deleteGmailDraft({ accessToken, draftId });
    return json({ ok: true });
  } catch (err) {
    if (err instanceof GoogleAccessTokenError) {
      const mapped = accessTokenErrorToHttp(err);
      return json(mapped.body, mapped.status);
    }
    if (err instanceof GmailClientError) {
      console.error('[gmail]', { workflow: 'delete_draft', error: 'gmail_failed' });
      return json({ ok: false, error: 'Failed to discard Gmail draft' }, 502);
    }
    console.error('[gmail]', { workflow: 'delete_draft', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to discard Gmail draft' }, 500);
  }
};
