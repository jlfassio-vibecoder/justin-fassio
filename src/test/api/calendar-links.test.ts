import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApprovedStaffClientMock = vi.fn();
const getServiceRoleClientMock = vi.fn();
const getGoogleAccessTokenForProfileMock = vi.fn();
const loadConnectionForProfileMock = vi.fn();
const getCalendarEventMock = vi.fn();
const createCalendarEventMock = vi.fn();
const cancelCalendarEventMock = vi.fn();
const getCalendarEventLinkMock = vi.fn();
const upsertConfirmedCalendarEventLinkMock = vi.fn();
const deleteCalendarEventLinkMock = vi.fn();
const listConfirmedCalendarLinksForProspectMock = vi.fn();

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

vi.mock('@/lib/google/tokenStore', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/google/tokenStore')>('@/lib/google/tokenStore');
  return {
    ...actual,
    loadConnectionForProfile: (...args: unknown[]) => loadConnectionForProfileMock(...args),
  };
});

vi.mock('@/lib/google/calendarClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/google/calendarClient')>(
    '@/lib/google/calendarClient',
  );
  return {
    ...actual,
    getCalendarEvent: (...args: unknown[]) => getCalendarEventMock(...args),
    createCalendarEvent: (...args: unknown[]) => createCalendarEventMock(...args),
    cancelCalendarEvent: (...args: unknown[]) => cancelCalendarEventMock(...args),
  };
});

vi.mock('@/lib/google/calendarEventLinks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/google/calendarEventLinks')>(
    '@/lib/google/calendarEventLinks',
  );
  return {
    ...actual,
    getCalendarEventLink: (...args: unknown[]) => getCalendarEventLinkMock(...args),
    upsertConfirmedCalendarEventLink: (...args: unknown[]) =>
      upsertConfirmedCalendarEventLinkMock(...args),
    deleteCalendarEventLink: (...args: unknown[]) => deleteCalendarEventLinkMock(...args),
    listConfirmedCalendarLinksForProspect: (...args: unknown[]) =>
      listConfirmedCalendarLinksForProspectMock(...args),
  };
});

import {
  DELETE as linkDELETE,
  GET as linkGET,
  POST as linkPOST,
} from '@/pages/api/staff/calendar/events/[eventId]/link';
import { DELETE as eventDELETE } from '@/pages/api/staff/calendar/events/[eventId]';
import { POST as createPOST } from '@/pages/api/staff/calendar/events/index';
import { GET as linksListGET } from '@/pages/api/staff/calendar/links/index';

function ctx(partial: Record<string, unknown>) {
  return partial as unknown as Parameters<typeof linkGET>[0];
}

const sampleEvent = {
  id: 'ev-1',
  title: 'Intro',
  start: '2026-08-11T16:00:00Z',
  end: '2026-08-11T16:30:00Z',
  allDay: false,
  status: 'confirmed',
  meetUrl: 'https://meet.google.com/abc',
  attendees: [{ email: 'a@example.com' }],
  htmlLink: null,
  description: null,
  location: null,
};

describe('Calendar event link staff APIs', () => {
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
      connection: { id: 'conn-1' },
    });
    loadConnectionForProfileMock.mockResolvedValue({ id: 'conn-1' });
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
        params: { eventId: 'ev-1' },
        request: new Request('http://localhost/api/staff/calendar/events/ev-1/link'),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('creates event and upserts CRM link when prospectId provided', async () => {
    createCalendarEventMock.mockResolvedValue(sampleEvent);
    upsertConfirmedCalendarEventLinkMock.mockResolvedValue({
      id: 'link-1',
      google_connection_id: 'conn-1',
      calendar_id: 'primary',
      google_event_id: 'ev-1',
      prospect_id: 9,
      account_contact_id: 'c1',
      link_status: 'confirmed',
      title: 'Intro',
      start_at: sampleEvent.start,
      end_at: sampleEvent.end,
      meet_url: sampleEvent.meetUrl,
      attendees: ['a@example.com'],
      created_at: '',
      updated_at: '',
    });

    const res = await createPOST(
      ctx({
        request: new Request('http://localhost/api/staff/calendar/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'Intro',
            start: '2026-08-11T16:00:00Z',
            end: '2026-08-11T16:30:00Z',
            prospectId: 9,
            accountContactId: 'c1',
            createMeet: true,
          }),
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event.id).toBe('ev-1');
    expect(body.link.prospectId).toBe(9);
    expect(JSON.stringify(body)).not.toMatch(/access-secret/);
    expect(upsertConfirmedCalendarEventLinkMock).toHaveBeenCalled();
  });

  it('confirms and unlinks an event', async () => {
    getCalendarEventMock.mockResolvedValue(sampleEvent);
    upsertConfirmedCalendarEventLinkMock.mockResolvedValue({
      id: 'link-1',
      google_connection_id: 'conn-1',
      calendar_id: 'primary',
      google_event_id: 'ev-1',
      prospect_id: 9,
      account_contact_id: null,
      link_status: 'confirmed',
      title: 'Intro',
      start_at: sampleEvent.start,
      end_at: sampleEvent.end,
      meet_url: sampleEvent.meetUrl,
      attendees: [],
      created_at: '',
      updated_at: '',
    });
    const confirm = await linkPOST(
      ctx({
        params: { eventId: 'ev-1' },
        request: new Request('http://localhost/api/staff/calendar/events/ev-1/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prospectId: 9 }),
        }),
      }),
    );
    expect(confirm.status).toBe(200);

    deleteCalendarEventLinkMock.mockResolvedValue(true);
    getGoogleAccessTokenForProfileMock.mockClear();
    loadConnectionForProfileMock.mockClear();
    const unlink = await linkDELETE(
      ctx({
        params: { eventId: 'ev-1' },
        request: new Request('http://localhost/api/staff/calendar/events/ev-1/link', {
          method: 'DELETE',
        }),
      }),
    );
    expect(unlink.status).toBe(200);
    expect(getGoogleAccessTokenForProfileMock).not.toHaveBeenCalled();
    expect(loadConnectionForProfileMock).toHaveBeenCalled();
  });

  it('lists confirmed links for prospect', async () => {
    listConfirmedCalendarLinksForProspectMock.mockResolvedValue([
      {
        id: 'link-1',
        google_connection_id: 'conn-1',
        calendar_id: 'primary',
        google_event_id: 'ev-1',
        prospect_id: 9,
        account_contact_id: null,
        link_status: 'confirmed',
        title: 'Intro',
        start_at: sampleEvent.start,
        end_at: sampleEvent.end,
        meet_url: null,
        attendees: [],
        created_at: '',
        updated_at: '',
      },
    ]);
    const res = await linksListGET(
      ctx({
        request: new Request('http://localhost/api/staff/calendar/links?prospectId=9'),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.links).toHaveLength(1);
  });

  it('deletes CRM link when cancelling Google event', async () => {
    cancelCalendarEventMock.mockResolvedValue(undefined);
    deleteCalendarEventLinkMock.mockResolvedValue(true);
    // cancel path needs access token — reset call history after unlink test expectations
    getGoogleAccessTokenForProfileMock.mockClear();
    getGoogleAccessTokenForProfileMock.mockResolvedValue({
      accessToken: 'access-secret',
      connection: { id: 'conn-1' },
    });
    const res = await eventDELETE(
      ctx({
        params: { eventId: 'ev-1' },
        request: new Request('http://localhost/api/staff/calendar/events/ev-1', {
          method: 'DELETE',
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(deleteCalendarEventLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ googleEventId: 'ev-1', googleConnectionId: 'conn-1' }),
    );
  });
});
