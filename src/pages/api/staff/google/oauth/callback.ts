import type { APIRoute } from 'astro';
import {
  exchangeAuthorizationCode,
  fetchGoogleUserInfo,
  GoogleOAuthError,
  parseGrantedScopes,
} from '@/lib/google/oauth';
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  OAuthStateError,
  oauthStateCookieOptions,
  verifyOAuthState,
} from '@/lib/google/oauthState';
import { loadConnectionForProfile, upsertGoogleConnection } from '@/lib/google/tokenStore';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';

export const prerender = false;

function appRedirect(origin: string, params: Record<string, string>): Response {
  const url = new URL('/app', origin);
  url.searchParams.set('tab', 'messages');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  // Use a mutable Response (not Response.redirect): Astro appends Set-Cookie
  // from cookies.set() and immutable redirect headers throw TypeError: immutable → 500.
  return new Response(null, {
    status: 302,
    headers: { Location: url.toString() },
  });
}

export const GET: APIRoute = async ({ request, cookies }) => {
  const origin = new URL(request.url).origin;
  const clearStateCookie = () => {
    cookies.set(GOOGLE_OAUTH_STATE_COOKIE, '', { ...oauthStateCookieOptions(0), maxAge: 0 });
  };

  try {
    const url = new URL(request.url);
    if (url.searchParams.get('error')) {
      clearStateCookie();
      return appRedirect(origin, { google: 'error', reason: 'denied' });
    }

    const code = url.searchParams.get('code');
    const stateQuery = url.searchParams.get('state');
    const stateCookie = cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;

    if (!code || !stateQuery || !stateCookie || stateQuery !== stateCookie) {
      clearStateCookie();
      return appRedirect(origin, { google: 'error', reason: 'invalid_state' });
    }

    const statePayload = verifyOAuthState(stateQuery);
    const admin = getServiceRoleClient();
    if (!admin) {
      clearStateCookie();
      return appRedirect(origin, { google: 'error', reason: 'server_misconfigured' });
    }

    const tokens = await exchangeAuthorizationCode({ code, requestOrigin: origin });
    const userInfo = await fetchGoogleUserInfo({ accessToken: tokens.access_token });
    const scopes = parseGrantedScopes(tokens.scope);

    if (tokens.refresh_token) {
      await upsertGoogleConnection({
        profileId: statePayload.profileId,
        googleSub: userInfo.sub,
        googleEmail: userInfo.email,
        refreshToken: tokens.refresh_token,
        scopes,
        client: admin,
      });
      clearStateCookie();
      return appRedirect(origin, { google: 'connected' });
    }

    // Re-auth sometimes omits refresh_token; keep existing token if same Google subject.
    const existing = await loadConnectionForProfile(statePayload.profileId, admin);
    if (existing?.google_sub === userInfo.sub && existing.refresh_token_ciphertext) {
      const { error } = await admin
        .from('google_account_connections')
        .update({
          google_email: userInfo.email,
          scopes,
          status: 'active',
        })
        .eq('profile_id', statePayload.profileId);
      clearStateCookie();
      if (error) {
        return appRedirect(origin, { google: 'error', reason: 'store_failed' });
      }
      return appRedirect(origin, { google: 'connected' });
    }

    clearStateCookie();
    return appRedirect(origin, { google: 'error', reason: 'missing_refresh_token' });
  } catch (err) {
    clearStateCookie();
    if (err instanceof OAuthStateError) {
      return appRedirect(origin, { google: 'error', reason: 'invalid_state' });
    }
    if (err instanceof GoogleOAuthError) {
      console.error('[googleOAuth]', { workflow: 'callback', error: 'provider_failed' });
      return appRedirect(origin, { google: 'error', reason: 'provider_failed' });
    }
    console.error('[googleOAuth]', { workflow: 'callback', error: 'callback_failed' });
    return appRedirect(origin, { google: 'error', reason: 'callback_failed' });
  }
};
