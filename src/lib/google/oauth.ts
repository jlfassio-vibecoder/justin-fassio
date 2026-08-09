import {
  getGoogleOAuthConfig,
  GOOGLE_PHASE_A_SCOPES,
  type GoogleOAuthConfig,
} from '@/lib/google/config';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

export type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
};

export class GoogleOAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleOAuthError';
  }
}

export function buildGoogleAuthorizeUrl(params: {
  state: string;
  requestOrigin?: string;
  config?: GoogleOAuthConfig;
  /** Defaults to Phase A identity scopes. */
  scopes?: string[];
}): string {
  const config = params.config ?? getGoogleOAuthConfig(params.requestOrigin);
  const scopes = params.scopes?.length ? params.scopes : [...GOOGLE_PHASE_A_SCOPES];
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('state', params.state);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  return url.toString();
}

export async function exchangeAuthorizationCode(params: {
  code: string;
  requestOrigin?: string;
  config?: GoogleOAuthConfig;
  fetchImpl?: typeof fetch;
}): Promise<GoogleTokenResponse> {
  const config = params.config ?? getGoogleOAuthConfig(params.requestOrigin);
  const fetchImpl = params.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    code: params.code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json()) as GoogleTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || json.error) {
    throw new GoogleOAuthError(
      json.error_description || json.error || 'Google token exchange failed',
    );
  }
  if (!json.access_token) {
    throw new GoogleOAuthError('Google token response missing access_token');
  }
  return json;
}

export async function fetchGoogleUserInfo(params: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<GoogleUserInfo> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const res = await fetchImpl(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });
  const json = (await res.json()) as GoogleUserInfo & { error?: string };
  if (!res.ok || !json.sub || !json.email) {
    throw new GoogleOAuthError('Failed to verify Google account identity');
  }
  return {
    sub: json.sub,
    email: json.email,
    email_verified: json.email_verified,
    name: json.name,
  };
}

/** Best-effort revoke; does not throw on network/provider failure. */
export async function revokeGoogleToken(params: {
  token: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean }> {
  const fetchImpl = params.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(GOOGLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: params.token }),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

export function parseGrantedScopes(scopeHeader: string | undefined): string[] {
  if (!scopeHeader) return [...GOOGLE_PHASE_A_SCOPES];
  return scopeHeader
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
