/** Phase A identity scopes only — no Gmail/Calendar. */
export const GOOGLE_PHASE_A_SCOPES = ['openid', 'email', 'profile'] as const;

/** Phase B read-only Gmail (Restricted). Request via incremental OAuth. */
export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

/**
 * Phase C compose/send/drafts (Restricted).
 * Prefer this over gmail.send — compose covers messages.send + drafts.*; do not also request gmail.send.
 */
export const GMAIL_COMPOSE_SCOPE = 'https://www.googleapis.com/auth/gmail.compose';

export type GoogleOAuthScopePreset = 'identity' | 'gmail_readonly' | 'gmail_compose';

export function scopesForPreset(preset: GoogleOAuthScopePreset): string[] {
  if (preset === 'gmail_compose') {
    return [...GOOGLE_PHASE_A_SCOPES, GMAIL_READONLY_SCOPE, GMAIL_COMPOSE_SCOPE];
  }
  if (preset === 'gmail_readonly') {
    return [...GOOGLE_PHASE_A_SCOPES, GMAIL_READONLY_SCOPE];
  }
  return [...GOOGLE_PHASE_A_SCOPES];
}

function scopeMatches(scopes: string[], fullUri: string, bareName: string): boolean {
  const full = fullUri.toLowerCase();
  const bare = bareName.toLowerCase();
  const suffix = `/auth/${bare}`;
  return scopes.some((s) => {
    const value = s.trim().toLowerCase();
    return value === full || value === bare || value.endsWith(suffix);
  });
}

/** True if stored scopes include Gmail readonly (full URI or bare name). */
export function scopesIncludeGmailReadonly(scopes: string[] | null | undefined): boolean {
  if (!scopes?.length) return false;
  return scopeMatches(scopes, GMAIL_READONLY_SCOPE, 'gmail.readonly');
}

/** True if stored scopes include Gmail compose (full URI or bare name). */
export function scopesIncludeGmailCompose(scopes: string[] | null | undefined): boolean {
  if (!scopes?.length) return false;
  return scopeMatches(scopes, GMAIL_COMPOSE_SCOPE, 'gmail.compose');
}

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export class GoogleConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleConfigError';
  }
}

export function resolveGoogleRedirectUri(requestOrigin?: string): string {
  const configured = import.meta.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (configured) return configured;
  if (requestOrigin) {
    return `${requestOrigin.replace(/\/$/, '')}/api/staff/google/oauth/callback`;
  }
  throw new GoogleConfigError(
    'GOOGLE_OAUTH_REDIRECT_URI is not configured and request origin is unavailable',
  );
}

export function getGoogleClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = import.meta.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = import.meta.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new GoogleConfigError('Google OAuth is not configured');
  }
  return { clientId, clientSecret };
}

export function getGoogleOAuthConfig(requestOrigin?: string): GoogleOAuthConfig {
  const { clientId, clientSecret } = getGoogleClientCredentials();
  return {
    clientId,
    clientSecret,
    redirectUri: resolveGoogleRedirectUri(requestOrigin),
  };
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    import.meta.env.GOOGLE_CLIENT_ID?.trim() &&
    import.meta.env.GOOGLE_CLIENT_SECRET?.trim() &&
    import.meta.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim(),
  );
}
