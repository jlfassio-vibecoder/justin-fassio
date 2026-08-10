import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApprovedStaffClientMock = vi.fn();
const getServiceRoleClientMock = vi.fn();
const getGoogleAccessTokenForProfileMock = vi.fn();
const listUpcomingEventsMock = vi.fn();
const createCalendarEventMock = vi.fn();
const getCalendarEventMock = vi.fn();
const updateCalendarEventMock = vi.fn();
const cancelCalendarEventMock = vi.fn();

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

vi.mock('@/lib/google/calendarClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/google/calendarClient')>(
    '@/lib/google/calendarClient',
  );
  return {
    ...actual,
    listUpcomingEvents: (...args: unknown[]) => listUpcomingEventsMock(...args),
    createCalendarEvent: (...args: unknown[]) => createCalendarEventMock(...args),
    getCalendarEvent: (...args: unknown[]) => getCalendarEventMock(...args),
    updateCalendarEvent: (...args: unknown[]) => updateCalendarEventMock(...args),
    cancelCalendarEvent: (...args: unknown[]) => cancelCalendarEventMock(...args),
  };
});

import { GoogleAccessTokenError } from '@/lib/google/accessToken';
import {
  DELETE as eventDELETE,
  GET as eventGET,
  PATCH as eventPATCH,
} from '@/pages/api/staff/calendar/events/[eventId]';
import { GET as listGET, POST as createPOST } from '@/pages/api/staff/calendar/events/index';

function ctx(partial: Record<string, unknown>) {
  return partial as unknown as Parameters<typeof listGET>[0];
}

describe('Calendar events staff APIs', () => {
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
  });

  it('denies unauthenticated list', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'Missing bearer token' }), {
        status: 401,
      }),
    });
    const res = await listGET(
      ctx({ request: new Request('http://localhost/api/staff/calendar/events') }),
    );
    expect(res.status).toBe(401);
  });

  it('lists upcoming events without leaking access token', async () => {
    listUpcomingEventsMock.mockResolvedValue({
      events: [
        {
          id: 'ev-1',
          title: 'Call',
          start: '2026-08-10T15:00:00Z',
          end: '2026-08-10T15:30:00Z',
          allDay: false,
          status: 'confirmed',
          meetUrl: null,
          attendees: [],
          htmlLink: null,
        },
      ],
      nextPageToken: null,
    });
    const res = await listGET(
      ctx({ request: new Request('http://localhost/api/staff/calendar/events') }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.events).toHaveLength(1);
    expect(getGoogleAccessTokenForProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requireGmailReadonly: false,
        requireCalendarEvents: true,
      }),
    );
    expect(JSON.stringify(body)).not.toMatch(/access-secret|refresh_token/i);
  });

  it('returns needsCalendarEvents when scope missing', async () => {
    getGoogleAccessTokenForProfileMock.mockRejectedValue(
      new GoogleAccessTokenError(
        'needs_calendar_events',
        'Google Calendar access has not been granted',
      ),
    );
    const res = await listGET(
      ctx({ request: new Request('http://localhost/api/staff/calendar/events') }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.needsCalendarEvents).toBe(true);
  });

  it('creates an event', async () => {
    createCalendarEventMock.mockResolvedValue({
      id: 'ev-new',
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
            attendeeEmails: ['a@example.com'],
            createMeet: true,
          }),
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event.id).toBe('ev-new');
    expect(createCalendarEventMock).toHaveBeenCalled();
  });

  it('gets an event by id', async () => {
    getCalendarEventMock.mockResolvedValue({
      id: 'ev-1',
      title: 'Call',
      start: '2026-08-10T15:00:00Z',
      end: '2026-08-10T15:30:00Z',
      allDay: false,
      status: 'confirmed',
      meetUrl: null,
      attendees: [],
      htmlLink: null,
      description: null,
      location: null,
    });
    const res = await eventGET(
      ctx({
        params: { eventId: 'ev-1' },
        request: new Request('http://localhost/api/staff/calendar/events/ev-1'),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event.id).toBe('ev-1');
    expect(getCalendarEventMock).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'ev-1' }));
  });

  it('patches an event', async () => {
    updateCalendarEventMock.mockResolvedValue({
      id: 'ev-1',
      title: 'Updated',
      start: '2026-08-10T16:00:00Z',
      end: '2026-08-10T16:30:00Z',
      allDay: false,
      status: 'confirmed',
      meetUrl: null,
      attendees: [],
      htmlLink: null,
      description: null,
      location: null,
    });
    const res = await eventPATCH(
      ctx({
        params: { eventId: 'ev-1' },
        request: new Request('http://localhost/api/staff/calendar/events/ev-1', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'Updated',
            start: '2026-08-10T16:00:00Z',
            end: '2026-08-10T16:30:00Z',
          }),
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event.title).toBe('Updated');
  });

  it('rejects invalid PATCH body', async () => {
    const res = await eventPATCH(
      ctx({
        params: { eventId: 'ev-1' },
        request: new Request('http://localhost/api/staff/calendar/events/ev-1', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'Updated',
            start: '2026-08-10T16:30:00Z',
            end: '2026-08-10T16:00:00Z',
          }),
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(updateCalendarEventMock).not.toHaveBeenCalled();
  });

  it('cancels an event', async () => {
    cancelCalendarEventMock.mockResolvedValue(undefined);
    const res = await eventDELETE(
      ctx({
        params: { eventId: 'ev-1' },
        request: new Request('http://localhost/api/staff/calendar/events/ev-1', {
          method: 'DELETE',
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(cancelCalendarEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'ev-1' }),
    );
  });
});
