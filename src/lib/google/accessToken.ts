import {
  getGoogleClientCredentials,
  scopesIncludeGmailCompose,
  scopesIncludeGmailReadonly,
} from '@/lib/google/config';
import { GoogleOAuthError } from '@/lib/google/oauth';
import {
  loadConnectionForProfile,
  type GoogleConnectionRow,
  GoogleTokenStoreError,
} from '@/lib/google/tokenStore';
import { decryptRefreshToken } from '@/lib/google/tokenCrypto';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export class GoogleAccessTokenError extends Error {
  readonly code:
    | 'not_connected'
    | 'needs_gmail_readonly'
    | 'needs_gmail_compose'
    | 'revoked'
    | 'misconfigured'
    | 'refresh_failed';

  constructor(code: GoogleAccessTokenError['code'], message: string) {
    super(message);
    this.name = 'GoogleAccessTokenError';
    this.code = code;
  }
}

type AdminClient = SupabaseClient<Database>;

async function markConnectionError(profileId: string, admin: AdminClient): Promise<void> {
  try {
    await admin
      .from('google_account_connections')
      .update({ status: 'error' })
      .eq('profile_id', profileId);
  } catch {
    // best-effort
  }
}

export async function getGoogleAccessTokenForProfile(params: {
  profileId: string;
  requireGmailReadonly?: boolean;
  requireGmailCompose?: boolean;
  client?: AdminClient | null;
  fetchImpl?: typeof fetch;
}): Promise<{ accessToken: string; connection: GoogleConnectionRow }> {
  const admin = params.client ?? getServiceRoleClient();
  if (!admin) {
    throw new GoogleAccessTokenError(
      'misconfigured',
      'Server misconfigured (missing service role)',
    );
  }

  let connection: GoogleConnectionRow | null;
  try {
    connection = await loadConnectionForProfile(params.profileId, admin);
  } catch (err) {
    if (err instanceof GoogleTokenStoreError) {
      throw new GoogleAccessTokenError('misconfigured', err.message);
    }
    throw err;
  }

  if (!connection || connection.status !== 'active') {
    throw new GoogleAccessTokenError('not_connected', 'Google Workspace is not connected');
  }

  if (params.requireGmailReadonly !== false && !scopesIncludeGmailReadonly(connection.scopes)) {
    throw new GoogleAccessTokenError(
      'needs_gmail_readonly',
      'Gmail read access has not been granted',
    );
  }

  if (params.requireGmailCompose && !scopesIncludeGmailCompose(connection.scopes)) {
    throw new GoogleAccessTokenError(
      'needs_gmail_compose',
      'Gmail send/drafts access has not been granted',
    );
  }

  let refreshToken: string;
  try {
    refreshToken = decryptRefreshToken(connection.refresh_token_ciphertext);
  } catch {
    await markConnectionError(params.profileId, admin);
    throw new GoogleAccessTokenError('revoked', 'Stored Google credential is invalid');
  }

  const { clientId, clientSecret } = getGoogleClientCredentials();
  const fetchImpl = params.fetchImpl ?? fetch;
  const res = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const json = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.access_token) {
    if (json.error === 'invalid_grant') {
      await markConnectionError(params.profileId, admin);
      throw new GoogleAccessTokenError(
        'revoked',
        'Google authorization was revoked; reconnect Google Workspace',
      );
    }
    throw new GoogleAccessTokenError(
      'refresh_failed',
      json.error_description || json.error || 'Failed to refresh Google access token',
    );
  }

  return { accessToken: json.access_token, connection };
}

export function accessTokenErrorToHttp(err: GoogleAccessTokenError): {
  status: number;
  body: Record<string, unknown>;
} {
  if (err.code === 'not_connected') {
    return { status: 409, body: { ok: false, error: err.message, needsConnect: true } };
  }
  if (err.code === 'needs_gmail_readonly') {
    return {
      status: 409,
      body: { ok: false, error: err.message, needsGmailReadonly: true },
    };
  }
  if (err.code === 'needs_gmail_compose') {
    return {
      status: 409,
      body: { ok: false, error: err.message, needsGmailCompose: true },
    };
  }
  if (err.code === 'revoked') {
    return { status: 409, body: { ok: false, error: err.message, needsReconnect: true } };
  }
  if (err.code === 'misconfigured') {
    return { status: 500, body: { ok: false, error: err.message } };
  }
  return { status: 502, body: { ok: false, error: 'Failed to authorize Gmail request' } };
}

/** Re-export for callers that catch GoogleOAuthError from adjacent helpers. */
export { GoogleOAuthError };
