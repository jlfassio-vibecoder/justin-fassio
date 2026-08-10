import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadConnectionForProfileMock = vi.fn();
const getServiceRoleClientMock = vi.fn();

vi.mock('@/lib/google/tokenStore', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/google/tokenStore')>('@/lib/google/tokenStore');
  return {
    ...actual,
    loadConnectionForProfile: (...args: unknown[]) => loadConnectionForProfileMock(...args),
  };
});

vi.mock('@/lib/supabaseAdmin', () => ({
  getServiceRoleClient: (...args: unknown[]) => getServiceRoleClientMock(...args),
}));

import { encryptRefreshToken } from '@/lib/google/tokenCrypto';
import {
  accessTokenErrorToHttp,
  getGoogleAccessTokenForProfile,
  GoogleAccessTokenError,
} from '@/lib/google/accessToken';

describe('getGoogleAccessTokenForProfile', () => {
  const key = randomBytes(32).toString('base64');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GOOGLE_TOKEN_ENCRYPTION_KEY', key);
    vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret');
    getServiceRoleClientMock.mockReturnValue({
      from: () => ({
        update: () => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    });
  });

  it('rejects when Gmail readonly scope is missing', async () => {
    loadConnectionForProfileMock.mockResolvedValue({
      id: 'c1',
      profile_id: 'p1',
      google_sub: 'sub',
      google_email: 'a@b.com',
      refresh_token_ciphertext: encryptRefreshToken('refresh', key),
      scopes: ['openid', 'email', 'profile'],
      status: 'active',
      created_at: '',
      updated_at: '',
    });

    await expect(
      getGoogleAccessTokenForProfile({ profileId: 'p1', requireGmailReadonly: true }),
    ).rejects.toBeInstanceOf(GoogleAccessTokenError);
    await expect(
      getGoogleAccessTokenForProfile({ profileId: 'p1', requireGmailReadonly: true }),
    ).rejects.toMatchObject({ code: 'needs_gmail_readonly' });
  });

  it('rejects when Calendar events scope is missing', async () => {
    loadConnectionForProfileMock.mockResolvedValue({
      id: 'c1',
      profile_id: 'p1',
      google_sub: 'sub',
      google_email: 'a@b.com',
      refresh_token_ciphertext: encryptRefreshToken('refresh', key),
      scopes: ['openid', 'https://www.googleapis.com/auth/gmail.readonly'],
      status: 'active',
      created_at: '',
      updated_at: '',
    });

    await expect(
      getGoogleAccessTokenForProfile({
        profileId: 'p1',
        requireGmailReadonly: false,
        requireCalendarEvents: true,
      }),
    ).rejects.toMatchObject({ code: 'needs_calendar_events' });
  });

  it('refreshes access token when readonly scope is present', async () => {
    loadConnectionForProfileMock.mockResolvedValue({
      id: 'c1',
      profile_id: 'p1',
      google_sub: 'sub',
      google_email: 'a@b.com',
      refresh_token_ciphertext: encryptRefreshToken('refresh', key),
      scopes: ['openid', 'https://www.googleapis.com/auth/gmail.readonly'],
      status: 'active',
      created_at: '',
      updated_at: '',
    });

    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ access_token: 'access-1' }), { status: 200 }),
    );

    const result = await getGoogleAccessTokenForProfile({
      profileId: 'p1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.accessToken).toBe('access-1');
    expect(JSON.stringify({ accessToken: result.accessToken })).not.toContain('refresh');
  });

  it('maps status=error to revoked needsReconnect', async () => {
    loadConnectionForProfileMock.mockResolvedValue({
      id: 'c1',
      profile_id: 'p1',
      google_sub: 'sub',
      google_email: 'a@b.com',
      refresh_token_ciphertext: encryptRefreshToken('refresh', key),
      scopes: ['openid', 'https://www.googleapis.com/auth/gmail.readonly'],
      status: 'error',
      created_at: '',
      updated_at: '',
    });

    await expect(getGoogleAccessTokenForProfile({ profileId: 'p1' })).rejects.toMatchObject({
      code: 'revoked',
    });
  });

  it('maps invalid_grant refresh to revoked', async () => {
    loadConnectionForProfileMock.mockResolvedValue({
      id: 'c1',
      profile_id: 'p1',
      google_sub: 'sub',
      google_email: 'a@b.com',
      refresh_token_ciphertext: encryptRefreshToken('refresh', key),
      scopes: ['openid', 'https://www.googleapis.com/auth/gmail.readonly'],
      status: 'active',
      created_at: '',
      updated_at: '',
    });

    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: 'invalid_grant', error_description: 'Token revoked' }),
          {
            status: 400,
          },
        ),
    );

    await expect(
      getGoogleAccessTokenForProfile({
        profileId: 'p1',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'revoked' });
  });
});

describe('accessTokenErrorToHttp', () => {
  it('maps revoked to needsReconnect', () => {
    const mapped = accessTokenErrorToHttp(
      new GoogleAccessTokenError('revoked', 'Google authorization was revoked'),
    );
    expect(mapped.status).toBe(409);
    expect(mapped.body).toMatchObject({ ok: false, needsReconnect: true });
    expect(JSON.stringify(mapped.body)).not.toMatch(/refresh_token|ciphertext/i);
  });
});
