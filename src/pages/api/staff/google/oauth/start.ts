import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { GoogleConfigError, isGoogleOAuthConfigured } from '@/lib/google/config';
import { buildGoogleAuthorizeUrl } from '@/lib/google/oauth';
import {
  createOAuthState,
  GOOGLE_OAUTH_STATE_COOKIE,
  OAuthStateError,
  oauthStateCookieOptions,
} from '@/lib/google/oauthState';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  if (!isGoogleOAuthConfigured()) {
    return json({ ok: false, error: 'Google OAuth is not configured' }, 503);
  }

  try {
    const origin = new URL(request.url).origin;
    const state = createOAuthState(gate.userId);
    cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, oauthStateCookieOptions());
    const authorizeUrl = buildGoogleAuthorizeUrl({ state, requestOrigin: origin });
    return json({ ok: true, authorizeUrl });
  } catch (err) {
    if (err instanceof GoogleConfigError || err instanceof OAuthStateError) {
      return json({ ok: false, error: err.message }, 503);
    }
    console.error('[googleOAuth]', { workflow: 'start', error: 'start_failed' });
    return json({ ok: false, error: 'Failed to start Google OAuth' }, 500);
  }
};
