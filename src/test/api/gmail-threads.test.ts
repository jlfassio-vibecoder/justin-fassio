import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApprovedStaffClientMock = vi.fn();
const getServiceRoleClientMock = vi.fn();
const getGoogleAccessTokenForProfileMock = vi.fn();
const listGmailThreadsMock = vi.fn();
const getGmailThreadMock = vi.fn();

vi.mock('@/lib/agentAuth', () => ({
  requireApprovedStaffClient: (...args: unknown[]) => requireApprovedStaffClientMock(...args),
}));

vi.mock('@/lib/supabaseAdmin', () => ({
  getServiceRoleClient: (...args: unknown[]) => getServiceRoleClientMock(...args),
}));

vi.mock('@/lib/google/accessToken', async () => {
  const actual = await vi.importActual<typeof import('@/lib/google/accessToken')>(
    '@/lib/google/accessToken',
  );
  return {
    ...actual,
    getGoogleAccessTokenForProfile: (...args: unknown[]) =>
      getGoogleAccessTokenForProfileMock(...args),
  };
});

vi.mock('@/lib/google/gmailClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/google/gmailClient')>(
    '@/lib/google/gmailClient',
  );
  return {
    ...actual,
    listGmailThreads: (...args: unknown[]) => listGmailThreadsMock(...args),
    getGmailThread: (...args: unknown[]) => getGmailThreadMock(...args),
  };
});

import { GoogleAccessTokenError } from '@/lib/google/accessToken';
import { GET as listGET } from '@/pages/api/staff/gmail/threads/index';
import { GET as detailGET } from '@/pages/api/staff/gmail/threads/[threadId]';

function ctx(partial: Record<string, unknown>) {
  return partial as unknown as Parameters<typeof listGET>[0];
}

describe('Gmail threads staff APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServiceRoleClientMock.mockReturnValue({});
  });

  it('denies unauthenticated list', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'Missing bearer token' }), {
        status: 401,
      }),
    });
    const res = await listGET(
      ctx({
        request: new Request('http://localhost/api/staff/gmail/threads'),
      }),
    );
    expect(res.status).toBe(401);
    expect(listGmailThreadsMock).not.toHaveBeenCalled();
  });

  it('returns 409 needsGmailReadonly when scope missing', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      userId: 'profile-1',
      supabase: {},
    });
    getGoogleAccessTokenForProfileMock.mockRejectedValue(
      new GoogleAccessTokenError('needs_gmail_readonly', 'Gmail read access has not been granted'),
    );
    const res = await listGET(
      ctx({
        request: new Request('http://localhost/api/staff/gmail/threads'),
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.needsGmailReadonly).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/refresh_token|ciphertext|access_token/i);
  });

  it('lists threads and omits secrets', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      userId: 'profile-1',
      supabase: {},
    });
    getGoogleAccessTokenForProfileMock.mockResolvedValue({
      accessToken: 'access-secret',
      connection: { scopes: ['gmail.readonly'] },
    });
    listGmailThreadsMock.mockResolvedValue({
      threads: [
        {
          id: 't1',
          subject: 'Hi',
          snippet: 'snip',
          from: 'a@b.com',
          to: 'c@d.com',
          date: null,
          unread: false,
        },
      ],
      nextPageToken: 'n1',
      resultSizeEstimate: 1,
    });

    const res = await listGET(
      ctx({
        request: new Request(
          'http://localhost/api/staff/gmail/threads?label=SENT&q=order&pageToken=p0',
        ),
      }),
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('access-secret');
    expect(text).not.toMatch(/refresh_token|ciphertext/i);
    expect(listGmailThreadsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'SENT',
        q: 'order',
        pageToken: 'p0',
        accessToken: 'access-secret',
      }),
    );
  });

  it('loads thread detail for approved staff', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      userId: 'profile-1',
      supabase: {},
    });
    getGoogleAccessTokenForProfileMock.mockResolvedValue({
      accessToken: 'access-secret',
      connection: {},
    });
    getGmailThreadMock.mockResolvedValue({
      id: 't1',
      subject: 'Hi',
      snippet: '',
      unread: false,
      messages: [],
    });

    const res = await detailGET(
      ctx({
        request: new Request('http://localhost/api/staff/gmail/threads/t1'),
        params: { threadId: 't1' },
      }) as unknown as Parameters<typeof detailGET>[0],
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.thread.id).toBe('t1');
    expect(JSON.stringify(body)).not.toContain('access-secret');
  });
});
