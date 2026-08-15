import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import {
  accessTokenErrorToHttp,
  getGoogleAccessTokenForProfile,
  GoogleAccessTokenError,
} from '@/lib/google/accessToken';
import {
  CalendarClientError,
  createCalendarEvent,
  listUpcomingEvents,
} from '@/lib/google/calendarClient';
import { calendarClientErrorJsonResponse } from '@/lib/google/calendarErrors';
import {
  CalendarEventLinkError,
  PRIMARY_CALENDAR_ID,
  toPublicCalendarEventLink,
  upsertConfirmedCalendarEventLink,
} from '@/lib/google/calendarEventLinks';
import type { CalendarEventDetail } from '@/lib/google/calendarTypes';
import {
  CalendarValidationError,
  parseCalendarEventWriteBody,
} from '@/lib/google/calendarValidation';
import { parseOptionalSalesLineId } from '@/lib/resolveSalesLineQuery';
import { isMultiLineWritesEnabled } from '@/lib/staffFeatures';
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

function parseOptionalLineIdFromBody(body: unknown): string | null {
  if (body == null || typeof body !== 'object') return null;
  if (!isMultiLineWritesEnabled()) return null;
  return parseOptionalSalesLineId((body as { salesLineId?: unknown }).salesLineId);
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

export const GET: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const maxRaw = url.searchParams.get('maxResults');
  const maxResults = maxRaw ? Number(maxRaw) : undefined;
  const pageToken = url.searchParams.get('pageToken') ?? undefined;
  const timeMin = url.searchParams.get('timeMin') ?? undefined;

  try {
    const { accessToken } = await withCalendarToken(gate.userId);
    const result = await listUpcomingEvents({
      accessToken,
      timeMin,
      pageToken,
      maxResults: Number.isFinite(maxResults) ? maxResults : undefined,
    });
    return json({
      ok: true,
      events: result.events,
      nextPageToken: result.nextPageToken,
    });
  } catch (err) {
    if (err instanceof GoogleAccessTokenError) {
      const mapped = accessTokenErrorToHttp(err);
      return json(mapped.body, mapped.status);
    }
    if (err instanceof CalendarClientError) {
      return calendarClientErrorJsonResponse('list_events', err, 'Failed to load calendar events');
    }
    console.error('[calendar]', { workflow: 'list_events', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to load calendar events' }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

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
    const salesLineId = parseOptionalLineIdFromBody(body);
    const { accessToken, connection } = await withCalendarToken(gate.userId);
    const event = await createCalendarEvent({ accessToken, input });

    if (prospectId == null) {
      return json({ ok: true, event });
    }

    try {
      const row = await upsertConfirmedCalendarEventLink({
        client: gate.supabase,
        googleConnectionId: connection.id,
        googleEventId: event.id,
        prospectId,
        accountContactId,
        salesLineId,
        calendarId: PRIMARY_CALENDAR_ID,
        cache: cacheFromEvent(event),
      });
      return json({ ok: true, event, link: toPublicCalendarEventLink(row) });
    } catch (linkErr) {
      const linkError =
        linkErr instanceof CalendarEventLinkError
          ? linkErr.message
          : 'Failed to save CRM calendar link';
      console.error('[calendar]', { workflow: 'create_event_link', error: 'link_failed' });
      return json({ ok: true, event, linkError });
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
        'create_event',
        err,
        'Failed to create calendar event',
      );
    }
    console.error('[calendar]', { workflow: 'create_event', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to create calendar event' }, 500);
  }
};
