import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApprovedStaffClientMock = vi.fn();
const getServiceRoleClientMock = vi.fn();
const getGoogleAccessTokenForProfileMock = vi.fn();
const getGmailThreadMock = vi.fn();
const matchParticipantsToCrmMock = vi.fn();
const getGmailThreadLinkMock = vi.fn();
const upsertConfirmedGmailThreadLinkMock = vi.fn();
const deleteGmailThreadLinkMock = vi.fn();
const listConfirmedLinksForProspectMock = vi.fn();

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
    getGmailThread: (...args: unknown[]) => getGmailThreadMock(...args),
  };
});

vi.mock('@/lib/google/crmEmailMatch', async () => {
  const actual = await vi.importActual<typeof import('@/lib/google/crmEmailMatch')>(
    '@/lib/google/crmEmailMatch',
  );
  return {
    ...actual,
    matchParticipantsToCrm: (...args: unknown[]) => matchParticipantsToCrmMock(...args),
  };
});

vi.mock('@/lib/google/gmailThreadLinks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/google/gmailThreadLinks')>(
    '@/lib/google/gmailThreadLinks',
  );
  return {
    ...actual,
    getGmailThreadLink: (...args: unknown[]) => getGmailThreadLinkMock(...args),
    upsertConfirmedGmailThreadLink: (...args: unknown[]) =>
      upsertConfirmedGmailThreadLinkMock(...args),
    deleteGmailThreadLink: (...args: unknown[]) => deleteGmailThreadLinkMock(...args),
    listConfirmedLinksForProspect: (...args: unknown[]) =>
      listConfirmedLinksForProspectMock(...args),
  };
});

import {
  DELETE as linkDELETE,
  GET as linkGET,
  POST as linkPOST,
} from '@/pages/api/staff/gmail/threads/[threadId]/link';
import { GET as linksListGET } from '@/pages/api/staff/gmail/links/index';

function ctx(partial: Record<string, unknown>) {
  return partial as unknown as Parameters<typeof linkGET>[0];
}

describe('Gmail thread link staff APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServiceRoleClientMock.mockReturnValue({});
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      userId: 'profile-1',
      supabase: {},
    });
    getGoogleAccessTokenForProfileMock.mockResolvedValue({
      accessToken: 'access-secret',
      connection: {
        id: 'conn-1',
        google_email: 'office@example.com',
        scopes: ['gmail.readonly'],
      },
    });
  });

  it('denies unauthenticated link get', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'Missing bearer token' }), {
        status: 401,
      }),
    });
    const res = await linkGET(
      ctx({
        params: { threadId: 'thr-1' },
        request: new Request('http://localhost/api/staff/gmail/threads/thr-1/link'),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns suggestions without persisting on GET', async () => {
    getGmailThreadMock.mockResolvedValue({
      id: 'thr-1',
      subject: 'Hello',
      snippet: 'Hi',
      unread: false,
      messages: [
        {
          id: 'm1',
          from: 'Alice <alice@example.com>',
          to: 'office@example.com',
          cc: '',
          date: '2026-08-09T00:00:00.000Z',
          subject: 'Hello',
          bodyText: 'Hi',
          bodyHtml: null,
          attachments: [],
        },
      ],
    });
    matchParticipantsToCrmMock.mockResolvedValue([
      {
        email: 'alice@example.com',
        role: 'from',
        accountContactId: 'c1',
        contactName: 'Alice',
        prospectId: 9,
        prospectName: 'Alice Shop',
        accountStatus: 'prospect',
        confidence: 'high',
      },
    ]);
    getGmailThreadLinkMock.mockResolvedValue(null);

    const res = await linkGET(
      ctx({
        params: { threadId: 'thr-1' },
        request: new Request('http://localhost/api/staff/gmail/threads/thr-1/link'),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.suggestions).toHaveLength(1);
    expect(body.link).toBeNull();
    expect(upsertConfirmedGmailThreadLinkMock).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toMatch(/access-secret|refresh_token/i);
  });

  it('confirms link on POST', async () => {
    getGmailThreadMock.mockResolvedValue({
      id: 'thr-1',
      subject: 'Hello',
      snippet: 'Hi',
      unread: true,
      messages: [
        {
          id: 'm1',
          from: 'Alice <alice@example.com>',
          to: 'office@example.com',
          cc: '',
          date: '2026-08-09T00:00:00.000Z',
          subject: 'Hello',
          bodyText: 'Hi',
          bodyHtml: null,
          attachments: [],
        },
      ],
    });
    upsertConfirmedGmailThreadLinkMock.mockResolvedValue({
      id: 'link-1',
      google_connection_id: 'conn-1',
      gmail_thread_id: 'thr-1',
      prospect_id: 9,
      account_contact_id: 'c1',
      link_status: 'confirmed',
      subject: 'Hello',
      snippet: 'Hi',
      participants: ['alice@example.com'],
      unread: true,
      last_message_at: '2026-08-09T00:00:00.000Z',
      created_at: '',
      updated_at: '',
    });

    const res = await linkPOST(
      ctx({
        params: { threadId: 'thr-1' },
        request: new Request('http://localhost/api/staff/gmail/threads/thr-1/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prospectId: 9, accountContactId: 'c1' }),
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.link.prospectId).toBe(9);
    expect(body.link.linkStatus).toBe('confirmed');
    expect(upsertConfirmedGmailThreadLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prospectId: 9,
        gmailThreadId: 'thr-1',
        googleConnectionId: 'conn-1',
      }),
    );
  });

  it('unlinks on DELETE', async () => {
    deleteGmailThreadLinkMock.mockResolvedValue(true);
    const res = await linkDELETE(
      ctx({
        params: { threadId: 'thr-1' },
        request: new Request('http://localhost/api/staff/gmail/threads/thr-1/link', {
          method: 'DELETE',
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(deleteGmailThreadLinkMock).toHaveBeenCalled();
  });

  it('lists confirmed links for prospect', async () => {
    listConfirmedLinksForProspectMock.mockResolvedValue([
      {
        id: 'link-1',
        google_connection_id: 'conn-1',
        gmail_thread_id: 'thr-1',
        prospect_id: 9,
        account_contact_id: null,
        link_status: 'confirmed',
        subject: 'Hello',
        snippet: 'Hi',
        participants: [],
        unread: false,
        last_message_at: null,
        created_at: '',
        updated_at: '',
      },
    ]);
    const res = await linksListGET(
      ctx({
        request: new Request('http://localhost/api/staff/gmail/links?prospectId=9'),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.links).toHaveLength(1);
    expect(body.links[0].gmailThreadId).toBe('thr-1');
  });
});
