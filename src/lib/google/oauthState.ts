import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const STATE_TTL_MS = 10 * 60 * 1000;
export const GOOGLE_OAUTH_STATE_COOKIE = 'google_oauth_state';

export type GoogleOAuthStatePayload = {
  profileId: string;
  nonce: string;
  exp: number;
};

export class OAuthStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthStateError';
  }
}

function signingSecret(): string {
  const key = import.meta.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  const clientSecret = import.meta.env.GOOGLE_CLIENT_SECRET;
  const material = key?.trim() || clientSecret?.trim();
  if (!material) {
    throw new OAuthStateError('OAuth state signing secret is not configured');
  }
  return material;
}

function sign(body: string): string {
  return createHmac('sha256', signingSecret()).update(body).digest('base64url');
}

export function createOAuthState(profileId: string, nowMs = Date.now()): string {
  if (!profileId) {
    throw new OAuthStateError('profileId is required');
  }
  const payload: GoogleOAuthStatePayload = {
    profileId,
    nonce: randomBytes(16).toString('base64url'),
    exp: nowMs + STATE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verifyOAuthState(
  state: string,
  expectedProfileId?: string,
  nowMs = Date.now(),
): GoogleOAuthStatePayload {
  if (!state || !state.includes('.')) {
    throw new OAuthStateError('Missing or malformed OAuth state');
  }
  const [body, signature] = state.split('.');
  if (!body || !signature) {
    throw new OAuthStateError('Missing or malformed OAuth state');
  }
  const expectedSig = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new OAuthStateError('Invalid OAuth state signature');
  }
  let payload: GoogleOAuthStatePayload;
  try {
    payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as GoogleOAuthStatePayload;
  } catch {
    throw new OAuthStateError('Invalid OAuth state payload');
  }
  if (
    typeof payload.profileId !== 'string' ||
    typeof payload.nonce !== 'string' ||
    typeof payload.exp !== 'number'
  ) {
    throw new OAuthStateError('Invalid OAuth state payload shape');
  }
  if (payload.exp < nowMs) {
    throw new OAuthStateError('OAuth state has expired');
  }
  if (expectedProfileId && payload.profileId !== expectedProfileId) {
    throw new OAuthStateError('OAuth state profile mismatch');
  }
  return payload;
}

export function oauthStateCookieOptions(maxAgeSeconds = Math.floor(STATE_TTL_MS / 1000)) {
  return {
    httpOnly: true,
    secure: import.meta.env.PROD === true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
