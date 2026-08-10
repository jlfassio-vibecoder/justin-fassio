import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import {
  accessTokenErrorToHttp,
  getGoogleAccessTokenForProfile,
  GoogleAccessTokenError,
} from '@/lib/google/accessToken';
import {
  CalendarClientError,
  cancelCalendarEvent,
  getCalendarEvent,
  updateCalendarEvent,
} from '@/lib/google/calendarClient';
import { calendarClientErrorJsonResponse } from '@/lib/google/calendarErrors';
import {
  CalendarEventLinkError,
  deleteCalendarEventLink,
  PRIMARY_CALENDAR_ID,
  refreshCalendarEventLinkCache,
  toPublicCalendarEventLink,
  upsertConfirmedCalendarEventLink,
} from '@/lib/google/calendarEventLinks';
import type { CalendarEventDetail } from '@/lib/google/calendarTypes';
import {
  CalendarValidationError,
  parseCalendarEventWriteBody,
} from '@/lib/google/calendarValidation';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function withCalendarToken(profileId: string) {
  const admin = getServiceRoleClient();
  if (!admin) throw new GoogleAccessTokenError('misconfigured', 'Server misconfigured');
  return getGoogleAccessTokenForProfile({
    profileId,
    requireGmailReadonly: false,
    requireCalendarEvents: true,
    client: admin,
  });
}

function eventIdFromParams(params: { eventId?: string | string[] }): string {
  return typeof params.eventId === 'string' ? params.eventId.trim() : '';
}

function parseOptionalProspectId(body: unknown): number | null {
  if (body == null || typeof body !== 'object') return null;
  const raw = (body as { prospectId?: unknown }).prospectId;
  if (raw == null || raw === '') return null;
  const prospectId = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(prospectId) || prospectId <= 0) return null;
  return prospectId;
}

function parseOptionalContactId(body: unknown): string | null {
  if (body == null || typeof body !== 'object') return null;
  const raw = (body as { accountContactId?: unknown }).accountContactId;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function cacheFromEvent(event: CalendarEventDetail) {
  return {
    title: event.title,
    startAt: event.start || null,
    endAt: event.end || null,
    meetUrl: event.meetUrl,
    attendees: event.attendees.map((a) => a.email),
  };
}

export const GET: APIRoute = async ({ request, params }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const eventId = eventIdFromParams(params);
  if (!eventId) return json({ ok: false, error: 'eventId is required' }, 400);

  try {
    const { accessToken } = await withCalendarToken(gate.userId);
    const event = await getCalendarEvent({ accessToken, eventId });
    return json({ ok: true, event });
  } catch (err) {
    if (err instanceof GoogleAccessTokenError) {
      const mapped = accessTokenErrorToHttp(err);
      return json(mapped.body, mapped.status);
    }
    if (err instanceof CalendarClientError) {
      return calendarClientErrorJsonResponse('get_event', err, 'Failed to load calendar event');
    }
    console.error('[calendar]', { workflow: 'get_event', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to load calendar event' }, 500);
  }
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const eventId = eventIdFromParams(params);
  if (!eventId) return json({ ok: false, error: 'eventId is required' }, 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  try {
    const input = parseCalendarEventWriteBody(body);
    const prospectId = parseOptionalProspectId(body);
    const accountContactId = parseOptionalContactId(body);
    const { accessToken, connection } = await withCalendarToken(gate.userId);
    const event = await updateCalendarEvent({ accessToken, eventId, input });
    const cache = cacheFromEvent(event);

    if (prospectId != null) {
      try {
        const row = await upsertConfirmedCalendarEventLink({
          client: gate.supabase,
          googleConnectionId: connection.id,
          googleEventId: eventId,
          prospectId,
          accountContactId,
          calendarId: PRIMARY_CALENDAR_ID,
          cache,
        });
        return json({ ok: true, event, link: toPublicCalendarEventLink(row) });
      } catch (linkErr) {
        const linkError =
          linkErr instanceof CalendarEventLinkError
            ? linkErr.message
            : 'Failed to save CRM calendar link';
        return json({ ok: true, event, linkError });
      }
    }

    try {
      const refreshed = await refreshCalendarEventLinkCache({
        client: gate.supabase,
        googleConnectionId: connection.id,
        googleEventId: eventId,
        calendarId: PRIMARY_CALENDAR_ID,
        cache,
      });
      return json({
        ok: true,
        event,
        link: refreshed ? toPublicCalendarEventLink(refreshed) : null,
      });
    } catch {
      return json({ ok: true, event });
    }
  } catch (err) {
    if (err instanceof CalendarValidationError) {
      return json({ ok: false, error: err.message }, 400);
    }
    if (err instanceof GoogleAccessTokenError) {
      const mapped = accessTokenErrorToHttp(err);
      return json(mapped.body, mapped.status);
    }
    if (err instanceof CalendarClientError) {
      return calendarClientErrorJsonResponse(
        'update_event',
        err,
        'Failed to update calendar event',
      );
    }
    console.error('[calendar]', { workflow: 'update_event', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to update calendar event' }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const eventId = eventIdFromParams(params);
  if (!eventId) return json({ ok: false, error: 'eventId is required' }, 400);

  try {
    const { accessToken, connection } = await withCalendarToken(gate.userId);
    await cancelCalendarEvent({ accessToken, eventId });
    try {
      await deleteCalendarEventLink({
        client: gate.supabase,
        googleConnectionId: connection.id,
        googleEventId: eventId,
        calendarId: PRIMARY_CALENDAR_ID,
      });
    } catch {
      // best-effort: Google cancel already succeeded
    }
    return json({ ok: true, deleted: true });
  } catch (err) {
    if (err instanceof GoogleAccessTokenError) {
      const mapped = accessTokenErrorToHttp(err);
      return json(mapped.body, mapped.status);
    }
    if (err instanceof CalendarClientError) {
      return calendarClientErrorJsonResponse(
        'cancel_event',
        err,
        'Failed to cancel calendar event',
      );
    }
    console.error('[calendar]', { workflow: 'cancel_event', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to cancel calendar event' }, 500);
  }
};
