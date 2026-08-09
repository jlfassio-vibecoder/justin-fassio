/** Phase A identity scopes only — no Gmail/Calendar. */
export const GOOGLE_PHASE_A_SCOPES = ['openid', 'email', 'profile'] as const;

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

export function getGoogleOAuthConfig(requestOrigin?: string): GoogleOAuthConfig {
  const clientId = import.meta.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = import.meta.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new GoogleConfigError('Google OAuth is not configured');
  }
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
