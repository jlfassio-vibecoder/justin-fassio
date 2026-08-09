import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import {
  accessTokenErrorToHttp,
  getGoogleAccessTokenForProfile,
  GoogleAccessTokenError,
} from '@/lib/google/accessToken';
import { GmailClientError, listGmailThreads } from '@/lib/google/gmailClient';
import { gmailClientErrorJsonResponse } from '@/lib/google/gmailErrors';
import type { GmailLabelFilter } from '@/lib/google/gmailTypes';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseLabel(raw: string | null): GmailLabelFilter {
  if (raw === 'SENT' || raw === 'DRAFT' || raw === 'INBOX') return raw;
  return 'INBOX';
}

export const GET: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const admin = getServiceRoleClient();
  if (!admin) {
    return json({ ok: false, error: 'Server misconfigured' }, 500);
  }

  const url = new URL(request.url);
  const label = parseLabel(url.searchParams.get('label'));
  const q = url.searchParams.get('q') ?? undefined;
  const pageToken = url.searchParams.get('pageToken') ?? undefined;
  const maxRaw = url.searchParams.get('maxResults');
  const maxResults = maxRaw ? Number(maxRaw) : undefined;

  try {
    const { accessToken } = await getGoogleAccessTokenForProfile({
      profileId: gate.userId,
      requireGmailReadonly: true,
      client: admin,
    });
    const result = await listGmailThreads({
      accessToken,
      label,
      q: q ?? undefined,
      pageToken: pageToken ?? undefined,
      maxResults: Number.isFinite(maxResults) ? maxResults : undefined,
    });
    return json({
      ok: true,
      threads: result.threads,
      nextPageToken: result.nextPageToken,
      resultSizeEstimate: result.resultSizeEstimate,
      label,
    });
  } catch (err) {
    if (err instanceof GoogleAccessTokenError) {
      const mapped = accessTokenErrorToHttp(err);
      return json(mapped.body, mapped.status);
    }
    if (err instanceof GmailClientError) {
      return gmailClientErrorJsonResponse('list_threads', err, 'Failed to load Gmail threads');
    }
    console.error('[gmail]', { workflow: 'list_threads', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to load Gmail threads' }, 500);
  }
};
