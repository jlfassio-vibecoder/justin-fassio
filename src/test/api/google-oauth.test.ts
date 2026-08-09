import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApprovedStaffClientMock = vi.fn();
const getServiceRoleClientMock = vi.fn();
const loadConnectionForProfileMock = vi.fn();
const upsertGoogleConnectionMock = vi.fn();
const deleteGoogleConnectionMock = vi.fn();
const exchangeAuthorizationCodeMock = vi.fn();
const fetchGoogleUserInfoMock = vi.fn();
const revokeGoogleTokenMock = vi.fn();
const buildGoogleAuthorizeUrlMock = vi.fn();
const isGoogleOAuthConfiguredMock = vi.fn();

vi.mock('@/lib/agentAuth', () => ({
  requireApprovedStaffClient: (...args: unknown[]) => requireApprovedStaffClientMock(...args),
}));

vi.mock('@/lib/supabaseAdmin', () => ({
  getServiceRoleClient: (...args: unknown[]) => getServiceRoleClientMock(...args),
}));

vi.mock('@/lib/google/tokenStore', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/google/tokenStore')>('@/lib/google/tokenStore');
  return {
    ...actual,
    loadConnectionForProfile: (...args: unknown[]) => loadConnectionForProfileMock(...args),
    upsertGoogleConnection: (...args: unknown[]) => upsertGoogleConnectionMock(...args),
    deleteGoogleConnection: (...args: unknown[]) => deleteGoogleConnectionMock(...args),
  };
});

vi.mock('@/lib/google/oauth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/google/oauth')>('@/lib/google/oauth');
  return {
    ...actual,
    exchangeAuthorizationCode: (...args: unknown[]) => exchangeAuthorizationCodeMock(...args),
    fetchGoogleUserInfo: (...args: unknown[]) => fetchGoogleUserInfoMock(...args),
    revokeGoogleToken: (...args: unknown[]) => revokeGoogleTokenMock(...args),
    buildGoogleAuthorizeUrl: (...args: unknown[]) => buildGoogleAuthorizeUrlMock(...args),
  };
});

vi.mock('@/lib/google/config', async () => {
  const actual = await vi.importActual<typeof import('@/lib/google/config')>('@/lib/google/config');
  return {
    ...actual,
    isGoogleOAuthConfigured: (...args: unknown[]) => isGoogleOAuthConfiguredMock(...args),
  };
});

import { GET as connectionGET } from '@/pages/api/staff/google/connection';
import { POST as disconnectPOST } from '@/pages/api/staff/google/disconnect';
import { GET as callbackGET } from '@/pages/api/staff/google/oauth/callback';
import { POST as startPOST } from '@/pages/api/staff/google/oauth/start';
import { createOAuthState, GOOGLE_OAUTH_STATE_COOKIE } from '@/lib/google/oauthState';

function cookieJar() {
  const store = new Map<string, string>();
  return {
    set(name: string, value: string) {
      store.set(name, value);
    },
    get(name: string) {
      const value = store.get(name);
      return value == null ? undefined : { value };
    },
    store,
  };
}

function ctx(partial: { request: Request; cookies?: ReturnType<typeof cookieJar> }) {
  return partial as unknown as Parameters<typeof startPOST>[0];
}

describe('Google OAuth staff APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GOOGLE_TOKEN_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
    vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret');
    vi.stubEnv(
      'GOOGLE_OAUTH_REDIRECT_URI',
      'http://localhost:4321/api/staff/google/oauth/callback',
    );
    isGoogleOAuthConfiguredMock.mockReturnValue(true);
    buildGoogleAuthorizeUrlMock.mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?x=1');
  });

  it('denies unauthenticated OAuth start', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'Missing bearer token' }), {
        status: 401,
      }),
    });
    const res = await startPOST(
      ctx({
        request: new Request('http://localhost/api/staff/google/oauth/start', { method: 'POST' }),
        cookies: cookieJar(),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('denies non-staff OAuth start', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), { status: 403 }),
    });
    const res = await startPOST(
      ctx({
        request: new Request('http://localhost/api/staff/google/oauth/start', { method: 'POST' }),
        cookies: cookieJar(),
      }),
    );
    expect(res.status).toBe(403);
  });

  it('starts OAuth for approved staff and sets state cookie', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      userId: 'profile-1',
      supabase: {},
    });
    const cookies = cookieJar();
    const res = await startPOST(
      ctx({
        request: new Request('http://localhost:4321/api/staff/google/oauth/start', {
          method: 'POST',
        }),
        cookies,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.authorizeUrl).toContain('accounts.google.com');
    expect(cookies.store.get(GOOGLE_OAUTH_STATE_COOKIE)).toBeTruthy();
    expect(buildGoogleAuthorizeUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: ['openid', 'email', 'profile'],
      }),
    );
  });

  it('starts OAuth with gmail.readonly for incremental grant', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      userId: 'profile-1',
      supabase: {},
    });
    const cookies = cookieJar();
    const res = await startPOST(
      ctx({
        request: new Request('http://localhost:4321/api/staff/google/oauth/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scopes: 'gmail_readonly' }),
        }),
        cookies,
      }),
    );
    expect(res.status).toBe(200);
    expect(buildGoogleAuthorizeUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: expect.arrayContaining([
          'openid',
          'https://www.googleapis.com/auth/gmail.readonly',
        ]),
      }),
    );
  });

  it('starts OAuth with gmail_compose preset keeping readonly', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      userId: 'profile-1',
      supabase: {},
    });
    const cookies = cookieJar();
    const res = await startPOST(
      ctx({
        request: new Request('http://localhost:4321/api/staff/google/oauth/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scopes: 'gmail_compose' }),
        }),
        cookies,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scopesPreset).toBe('gmail_compose');
    expect(buildGoogleAuthorizeUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: expect.arrayContaining([
          'openid',
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.compose',
        ]),
      }),
    );
    const scopes = buildGoogleAuthorizeUrlMock.mock.calls[0][0].scopes as string[];
    expect(scopes.some((s) => s.includes('gmail.send'))).toBe(false);
  });

  it('rejects callback with missing/invalid state', async () => {
    const res = await callbackGET(
      ctx({
        request: new Request('http://localhost:4321/api/staff/google/oauth/callback?code=abc'),
        cookies: cookieJar(),
      }) as unknown as Parameters<typeof callbackGET>[0],
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('google=error');
    expect(res.headers.get('Location')).toContain('invalid_state');
    // Astro appends Set-Cookie onto this Response; Response.redirect() is immutable and 500s in prod.
    expect(() => res.headers.append('Set-Cookie', 'x=1')).not.toThrow();
  });

  it('stores verified Google identity on successful callback', async () => {
    const state = createOAuthState('profile-1');
    const cookies = cookieJar();
    cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state);
    getServiceRoleClientMock.mockReturnValue({ from: vi.fn() });
    exchangeAuthorizationCodeMock.mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh-1',
      scope: 'openid email profile',
    });
    fetchGoogleUserInfoMock.mockResolvedValue({
      sub: 'google-sub-9',
      email: 'workspace@example.com',
    });
    upsertGoogleConnectionMock.mockResolvedValue({
      id: 'c1',
      profile_id: 'profile-1',
      google_sub: 'google-sub-9',
      google_email: 'workspace@example.com',
      refresh_token_ciphertext: 'v1:enc',
      scopes: ['openid', 'email', 'profile'],
      status: 'active',
      created_at: '',
      updated_at: '',
    });

    const res = await callbackGET(
      ctx({
        request: new Request(
          `http://localhost:4321/api/staff/google/oauth/callback?code=abc&state=${encodeURIComponent(state)}`,
        ),
        cookies,
      }) as unknown as Parameters<typeof callbackGET>[0],
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('google=connected');
    expect(upsertGoogleConnectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'profile-1',
        googleSub: 'google-sub-9',
        googleEmail: 'workspace@example.com',
        refreshToken: 'refresh-1',
      }),
    );
  });

  it('connection status never serializes ciphertext or tokens', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      userId: 'profile-1',
      supabase: {},
    });
    getServiceRoleClientMock.mockReturnValue({});
    loadConnectionForProfileMock.mockResolvedValue({
      id: 'c1',
      profile_id: 'profile-1',
      google_sub: 'sub',
      google_email: 'a@b.com',
      refresh_token_ciphertext: 'v1:DO_NOT_LEAK',
      scopes: ['openid'],
      status: 'active',
      created_at: '',
      updated_at: '',
    });

    const res = await connectionGET(
      ctx({
        request: new Request('http://localhost/api/staff/google/connection', {
          headers: { Authorization: 'Bearer t' },
        }),
      }) as unknown as Parameters<typeof connectionGET>[0],
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('DO_NOT_LEAK');
    expect(text).not.toMatch(/refresh_token|access_token|ciphertext/i);
    const body = JSON.parse(text) as {
      ok: boolean;
      connection: { connected: boolean; googleEmail: string };
    };
    expect(body.connection).toEqual(
      expect.objectContaining({ connected: true, googleEmail: 'a@b.com' }),
    );
  });

  it('requires staff auth for disconnect', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), { status: 403 }),
    });
    const res = await disconnectPOST(
      ctx({
        request: new Request('http://localhost/api/staff/google/disconnect', { method: 'POST' }),
      }) as unknown as Parameters<typeof disconnectPOST>[0],
    );
    expect(res.status).toBe(403);
    expect(deleteGoogleConnectionMock).not.toHaveBeenCalled();
  });

  it('disconnects and best-effort revokes for approved staff', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      userId: 'profile-1',
      supabase: {},
    });
    getServiceRoleClientMock.mockReturnValue({});
    deleteGoogleConnectionMock.mockResolvedValue({ deleted: true, refreshToken: 'refresh-1' });
    revokeGoogleTokenMock.mockResolvedValue({ ok: true });

    const res = await disconnectPOST(
      ctx({
        request: new Request('http://localhost/api/staff/google/disconnect', { method: 'POST' }),
      }) as unknown as Parameters<typeof disconnectPOST>[0],
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, disconnected: true });
    expect(deleteGoogleConnectionMock).toHaveBeenCalledWith('profile-1', {});
    expect(revokeGoogleTokenMock).toHaveBeenCalledWith({ token: 'refresh-1' });
  });
});
