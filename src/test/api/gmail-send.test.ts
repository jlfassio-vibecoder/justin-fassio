import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApprovedStaffClientMock = vi.fn();
const getServiceRoleClientMock = vi.fn();
const getGoogleAccessTokenForProfileMock = vi.fn();
const sendGmailMessageMock = vi.fn();
const replyToGmailThreadMock = vi.fn();
const createGmailDraftMock = vi.fn();
const listGmailDraftsMock = vi.fn();
const getGmailDraftMock = vi.fn();
const updateGmailDraftMock = vi.fn();
const sendGmailDraftMock = vi.fn();
const deleteGmailDraftMock = vi.fn();

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

vi.mock('@/lib/google/gmailSend', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/google/gmailSend')>('@/lib/google/gmailSend');
  return {
    ...actual,
    sendGmailMessage: (...args: unknown[]) => sendGmailMessageMock(...args),
    replyToGmailThread: (...args: unknown[]) => replyToGmailThreadMock(...args),
    createGmailDraft: (...args: unknown[]) => createGmailDraftMock(...args),
    listGmailDrafts: (...args: unknown[]) => listGmailDraftsMock(...args),
    getGmailDraft: (...args: unknown[]) => getGmailDraftMock(...args),
    updateGmailDraft: (...args: unknown[]) => updateGmailDraftMock(...args),
    sendGmailDraft: (...args: unknown[]) => sendGmailDraftMock(...args),
    deleteGmailDraft: (...args: unknown[]) => deleteGmailDraftMock(...args),
  };
});

import { GoogleAccessTokenError } from '@/lib/google/accessToken';
import { POST as sendPOST } from '@/pages/api/staff/gmail/send';
import { POST as replyPOST } from '@/pages/api/staff/gmail/threads/[threadId]/reply';
import { GET as draftsGET, POST as draftsPOST } from '@/pages/api/staff/gmail/drafts/index';
import {
  DELETE as draftDELETE,
  GET as draftGET,
  PATCH as draftPATCH,
} from '@/pages/api/staff/gmail/drafts/[draftId]';
import { POST as draftSendPOST } from '@/pages/api/staff/gmail/drafts/[draftId]/send';

function ctx(partial: Record<string, unknown>) {
  return partial as unknown as Parameters<typeof sendPOST>[0];
}

describe('Gmail send/drafts staff APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServiceRoleClientMock.mockReturnValue({});
  });

  it('denies unauthenticated send', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'Missing bearer token' }), {
        status: 401,
      }),
    });
    const res = await sendPOST(
      ctx({
        request: new Request('http://localhost/api/staff/gmail/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: 'a@example.com', subject: 'S', bodyText: 'B' }),
        }),
      }),
    );
    expect(res.status).toBe(401);
    expect(sendGmailMessageMock).not.toHaveBeenCalled();
  });

  it('returns 409 needsGmailCompose when scope missing', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      userId: 'profile-1',
      supabase: {},
    });
    getGoogleAccessTokenForProfileMock.mockRejectedValue(
      new GoogleAccessTokenError(
        'needs_gmail_compose',
        'Gmail send/drafts access has not been granted',
      ),
    );
    const res = await sendPOST(
      ctx({
        request: new Request('http://localhost/api/staff/gmail/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: 'a@example.com', subject: 'S', bodyText: 'B' }),
        }),
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.needsGmailCompose).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/refresh_token|ciphertext|access_token/i);
  });

  it('rejects client raw and from override', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      userId: 'profile-1',
      supabase: {},
    });
    const rawRes = await sendPOST(
      ctx({
        request: new Request('http://localhost/api/staff/gmail/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: 'a@example.com',
            subject: 'S',
            bodyText: 'B',
            raw: 'evil',
          }),
        }),
      }),
    );
    expect(rawRes.status).toBe(400);
    expect(sendGmailMessageMock).not.toHaveBeenCalled();

    const fromRes = await sendPOST(
      ctx({
        request: new Request('http://localhost/api/staff/gmail/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: 'a@example.com',
            subject: 'S',
            bodyText: 'B',
            from: 'spoof@example.com',
          }),
        }),
      }),
    );
    expect(fromRes.status).toBe(400);
  });

  it('sends message and omits secrets', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      userId: 'profile-1',
      supabase: {},
    });
    getGoogleAccessTokenForProfileMock.mockResolvedValue({
      accessToken: 'access-secret',
      connection: { google_email: 'me@example.com', scopes: ['gmail.compose'] },
    });
    sendGmailMessageMock.mockResolvedValue({ id: 'm1', threadId: 't1', labelIds: ['SENT'] });

    const res = await sendPOST(
      ctx({
        request: new Request('http://localhost/api/staff/gmail/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: 'a@example.com', subject: 'S', bodyText: 'B' }),
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, messageId: 'm1', threadId: 't1' });
    expect(JSON.stringify(body)).not.toMatch(/access-secret|refresh_token/i);
    expect(getGoogleAccessTokenForProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({ requireGmailCompose: true }),
    );
  });

  it('replies in thread', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      userId: 'profile-1',
      supabase: {},
    });
    getGoogleAccessTokenForProfileMock.mockResolvedValue({
      accessToken: 'access-secret',
      connection: { google_email: 'me@example.com' },
    });
    replyToGmailThreadMock.mockResolvedValue({ id: 'm2', threadId: 'thr', labelIds: [] });

    const res = await replyPOST(
      ctx({
        params: { threadId: 'thr' },
        request: new Request('http://localhost/api/staff/gmail/threads/thr/reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'reply', bodyText: 'Thanks' }),
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(replyToGmailThreadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thr',
        mode: 'reply',
        selfEmail: 'me@example.com',
      }),
    );
  });

  it('lists and creates drafts', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      userId: 'profile-1',
      supabase: {},
    });
    getGoogleAccessTokenForProfileMock.mockResolvedValue({
      accessToken: 'access-secret',
      connection: { google_email: 'me@example.com' },
    });
    listGmailDraftsMock.mockResolvedValue({
      drafts: [
        {
          id: 'd1',
          subject: 'Draft',
          snippet: '',
          to: 'a@example.com',
          messageId: 'm',
          threadId: 't',
          date: null,
        },
      ],
      nextPageToken: null,
    });
    createGmailDraftMock.mockResolvedValue({
      id: 'd2',
      subject: 'New',
      snippet: '',
      to: 'a@example.com',
      messageId: null,
      threadId: null,
      date: null,
    });

    const listRes = await draftsGET(
      ctx({ request: new Request('http://localhost/api/staff/gmail/drafts') }),
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.ok).toBe(true);
    expect(listBody.drafts).toHaveLength(1);
    expect(JSON.stringify(listBody)).not.toMatch(/access-secret/i);

    const createRes = await draftsPOST(
      ctx({
        request: new Request('http://localhost/api/staff/gmail/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: 'a@example.com', subject: 'New', bodyText: 'Hi' }),
        }),
      }),
    );
    expect(createRes.status).toBe(200);
  });

  it('gets updates sends and discards drafts', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      userId: 'profile-1',
      supabase: {},
    });
    getGoogleAccessTokenForProfileMock.mockResolvedValue({
      accessToken: 'access-secret',
      connection: { google_email: 'me@example.com' },
    });
    getGmailDraftMock.mockResolvedValue({
      id: 'd1',
      subject: 'S',
      bodyText: 'B',
      toList: ['a@example.com'],
      ccList: [],
      bccList: [],
      to: 'a@example.com',
      snippet: '',
      messageId: 'm',
      threadId: null,
      date: null,
    });
    updateGmailDraftMock.mockResolvedValue({
      id: 'd1',
      subject: 'S2',
      snippet: '',
      to: 'a@example.com',
      messageId: 'm',
      threadId: null,
      date: null,
    });
    sendGmailDraftMock.mockResolvedValue({ id: 'm9', threadId: 't9', labelIds: [] });
    deleteGmailDraftMock.mockResolvedValue(undefined);

    const getRes = await draftGET(
      ctx({
        params: { draftId: 'd1' },
        request: new Request('http://localhost/api/staff/gmail/drafts/d1'),
      }),
    );
    expect(getRes.status).toBe(200);

    const patchRes = await draftPATCH(
      ctx({
        params: { draftId: 'd1' },
        request: new Request('http://localhost/api/staff/gmail/drafts/d1', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: 'a@example.com', subject: 'S2', bodyText: 'B2' }),
        }),
      }),
    );
    expect(patchRes.status).toBe(200);

    const sendRes = await draftSendPOST(
      ctx({
        params: { draftId: 'd1' },
        request: new Request('http://localhost/api/staff/gmail/drafts/d1/send', {
          method: 'POST',
        }),
      }),
    );
    expect(sendRes.status).toBe(200);
    const sendBody = await sendRes.json();
    expect(sendBody).toEqual({ ok: true, messageId: 'm9', threadId: 't9' });

    const delRes = await draftDELETE(
      ctx({
        params: { draftId: 'd1' },
        request: new Request('http://localhost/api/staff/gmail/drafts/d1', { method: 'DELETE' }),
      }),
    );
    expect(delRes.status).toBe(200);
  });
});
