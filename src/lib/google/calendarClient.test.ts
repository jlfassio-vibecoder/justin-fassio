import { describe, expect, it, vi } from 'vitest';
import {
  CalendarClientError,
  cancelCalendarEvent,
  createCalendarEvent,
  listUpcomingEvents,
  updateCalendarEvent,
} from '@/lib/google/calendarClient';

describe('calendarClient', () => {
  it('lists upcoming events from primary calendar', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain('/calendars/primary/events');
      expect(url).toContain('singleEvents=true');
      expect(url).toContain('orderBy=startTime');
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'ev-1',
              summary: 'Buyer call',
              status: 'confirmed',
              htmlLink: 'https://calendar.google.com/event?eid=1',
              start: { dateTime: '2026-08-10T15:00:00Z' },
              end: { dateTime: '2026-08-10T15:30:00Z' },
              attendees: [{ email: 'buyer@example.com', responseStatus: 'needsAction' }],
              conferenceData: {
                entryPoints: [
                  { entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    });

    const result = await listUpcomingEvents({
      accessToken: 'token-secret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      id: 'ev-1',
      title: 'Buyer call',
      meetUrl: 'https://meet.google.com/abc-defg-hij',
      attendees: [{ email: 'buyer@example.com', responseStatus: 'needsAction' }],
    });
    expect(JSON.stringify(result)).not.toMatch(/token-secret/);
  });

  it('creates event with Meet conferenceDataVersion=1', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toContain('conferenceDataVersion=1');
      expect(url).toContain('sendUpdates=all');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body)) as {
        summary?: string;
        attendees?: { email: string }[];
        conferenceData?: { createRequest?: { conferenceSolutionKey?: { type?: string } } };
      };
      expect(body.summary).toBe('Intro');
      expect(body.attendees).toEqual([{ email: 'a@example.com' }]);
      expect(body.conferenceData?.createRequest?.conferenceSolutionKey?.type).toBe('hangoutsMeet');
      return new Response(
        JSON.stringify({
          id: 'ev-new',
          summary: 'Intro',
          start: { dateTime: '2026-08-11T16:00:00Z' },
          end: { dateTime: '2026-08-11T16:30:00Z' },
          attendees: [{ email: 'a@example.com' }],
          conferenceData: {
            entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/xyz' }],
          },
        }),
        { status: 200 },
      );
    });

    const event = await createCalendarEvent({
      accessToken: 'tok',
      input: {
        title: 'Intro',
        start: '2026-08-11T16:00:00Z',
        end: '2026-08-11T16:30:00Z',
        attendeeEmails: ['a@example.com'],
        createMeet: true,
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(event.id).toBe('ev-new');
    expect(event.meetUrl).toBe('https://meet.google.com/xyz');
  });

  it('patches and deletes with sendUpdates', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if ((init?.method ?? 'GET') === 'PATCH') {
        expect(url).toContain('/events/ev-1');
        expect(url).toContain('conferenceDataVersion=1');
        return new Response(
          JSON.stringify({
            id: 'ev-1',
            summary: 'Updated',
            start: { dateTime: '2026-08-11T17:00:00Z' },
            end: { dateTime: '2026-08-11T17:30:00Z' },
          }),
          { status: 200 },
        );
      }
      expect(init?.method).toBe('DELETE');
      expect(url).toContain('sendUpdates=all');
      return new Response(null, { status: 204 });
    });

    const updated = await updateCalendarEvent({
      accessToken: 'tok',
      eventId: 'ev-1',
      input: {
        title: 'Updated',
        start: '2026-08-11T17:00:00Z',
        end: '2026-08-11T17:30:00Z',
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(updated.title).toBe('Updated');

    await cancelCalendarEvent({
      accessToken: 'tok',
      eventId: 'ev-1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
  });

  it('maps Calendar API failures', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'Calendar API disabled' } }), {
          status: 403,
        }),
    );
    await expect(
      listUpcomingEvents({
        accessToken: 'tok',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(CalendarClientError);
  });
});
