import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import {
  GoogleConfigError,
  isGoogleOAuthConfigured,
  scopesForPreset,
  type GoogleOAuthScopePreset,
} from '@/lib/google/config';
import { buildGoogleAuthorizeUrl } from '@/lib/google/oauth';
import {
  createOAuthState,
  GOOGLE_OAUTH_STATE_COOKIE,
  OAuthStateError,
  oauthStateCookieOptions,
  parseReturnTab,
  type GoogleOAuthReturnTab,
} from '@/lib/google/oauthState';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseScopePreset(body: unknown): GoogleOAuthScopePreset {
  if (body == null || typeof body !== 'object') return 'identity';
  const scopes = (body as { scopes?: unknown }).scopes;
  if (scopes === 'gmail_compose') return 'gmail_compose';
  if (scopes === 'gmail_readonly') return 'gmail_readonly';
  if (scopes === 'calendar_events') return 'calendar_events';
  return 'identity';
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  if (!isGoogleOAuthConfigured()) {
    return json({ ok: false, error: 'Google OAuth is not configured' }, 503);
  }

  let preset: GoogleOAuthScopePreset = 'identity';
  let returnTab: GoogleOAuthReturnTab | undefined;
  try {
    const text = await request.text();
    if (text.trim()) {
      const body = JSON.parse(text) as unknown;
      preset = parseScopePreset(body);
      if (body != null && typeof body === 'object') {
        returnTab = parseReturnTab((body as { returnTab?: unknown }).returnTab);
      }
    }
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  try {
    const origin = new URL(request.url).origin;
    const state = createOAuthState(gate.userId, Date.now(), { returnTab });
    cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, oauthStateCookieOptions());
    const authorizeUrl = buildGoogleAuthorizeUrl({
      state,
      requestOrigin: origin,
      scopes: scopesForPreset(preset),
    });
    return json({ ok: true, authorizeUrl, scopesPreset: preset });
  } catch (err) {
    if (err instanceof GoogleConfigError || err instanceof OAuthStateError) {
      return json({ ok: false, error: err.message }, 503);
    }
    console.error('[googleOAuth]', { workflow: 'start', error: 'start_failed' });
    return json({ ok: false, error: 'Failed to start Google OAuth' }, 500);
  }
};
