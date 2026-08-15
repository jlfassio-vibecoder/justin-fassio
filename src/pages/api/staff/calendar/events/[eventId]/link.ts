import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import {
  accessTokenErrorToHttp,
  getGoogleAccessTokenForProfile,
  GoogleAccessTokenError,
} from '@/lib/google/accessToken';
import {
  CalendarEventLinkError,
  deleteCalendarEventLink,
  getCalendarEventLink,
  PRIMARY_CALENDAR_ID,
  toPublicCalendarEventLink,
  upsertConfirmedCalendarEventLink,
} from '@/lib/google/calendarEventLinks';
import { getCalendarEvent, CalendarClientError } from '@/lib/google/calendarClient';
import { calendarClientErrorJsonResponse } from '@/lib/google/calendarErrors';
import { GoogleTokenStoreError, loadConnectionForProfile } from '@/lib/google/tokenStore';
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

function eventIdFromParams(params: { eventId?: string | string[] }): string {
  return typeof params.eventId === 'string' ? params.eventId.trim() : '';
}

export const GET: APIRoute = async ({ request, params }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const eventId = eventIdFromParams(params);
  if (!eventId) return json({ ok: false, error: 'eventId is required' }, 400);

  const admin = getServiceRoleClient();
  if (!admin) return json({ ok: false, error: 'Server misconfigured' }, 500);

  try {
    const { connection } = await getGoogleAccessTokenForProfile({
      profileId: gate.userId,
      requireGmailReadonly: false,
      requireCalendarEvents: true,
      client: admin,
    });
    const existing = await getCalendarEventLink({
      client: gate.supabase,
      googleConnectionId: connection.id,
      googleEventId: eventId,
      calendarId: PRIMARY_CALENDAR_ID,
    });
    return json({
      ok: true,
      eventId,
      link: existing ? toPublicCalendarEventLink(existing) : null,
    });
  } catch (err) {
    if (err instanceof GoogleAccessTokenError) {
      const mapped = accessTokenErrorToHttp(err);
      return json(mapped.body, mapped.status);
    }
    if (err instanceof CalendarEventLinkError) {
      return json({ ok: false, error: err.message }, 500);
    }
    console.error('[calendar]', { workflow: 'event_link_get', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to load calendar link' }, 500);
  }
};

export const POST: APIRoute = async ({ request, params }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const eventId = eventIdFromParams(params);
  if (!eventId) return json({ ok: false, error: 'eventId is required' }, 400);

  let body: { prospectId?: unknown; accountContactId?: unknown; salesLineId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const prospectId =
    typeof body.prospectId === 'number' ? body.prospectId : Number(body.prospectId);
  if (!Number.isFinite(prospectId) || prospectId <= 0) {
    return json({ ok: false, error: 'prospectId is required' }, 400);
  }
  const accountContactId =
    typeof body.accountContactId === 'string' && body.accountContactId.trim()
      ? body.accountContactId.trim()
      : null;
  const salesLineId = isMultiLineWritesEnabled()
    ? parseOptionalSalesLineId(body.salesLineId)
    : null;

  const admin = getServiceRoleClient();
  if (!admin) return json({ ok: false, error: 'Server misconfigured' }, 500);

  try {
    const { accessToken, connection } = await getGoogleAccessTokenForProfile({
      profileId: gate.userId,
      requireGmailReadonly: false,
      requireCalendarEvents: true,
      client: admin,
    });
    const event = await getCalendarEvent({ accessToken, eventId });
    const row = await upsertConfirmedCalendarEventLink({
      client: gate.supabase,
      googleConnectionId: connection.id,
      googleEventId: eventId,
      prospectId,
      accountContactId,
      salesLineId,
      calendarId: PRIMARY_CALENDAR_ID,
      cache: {
        title: event.title,
        startAt: event.start || null,
        endAt: event.end || null,
        meetUrl: event.meetUrl,
        attendees: event.attendees.map((a) => a.email),
      },
    });
    return json({ ok: true, link: toPublicCalendarEventLink(row) });
  } catch (err) {
    if (err instanceof GoogleAccessTokenError) {
      const mapped = accessTokenErrorToHttp(err);
      return json(mapped.body, mapped.status);
    }
    if (err instanceof CalendarClientError) {
      return calendarClientErrorJsonResponse(
        'event_link_confirm',
        err,
        'Failed to link calendar event',
      );
    }
    if (err instanceof CalendarEventLinkError) {
      return json({ ok: false, error: err.message }, 400);
    }
    console.error('[calendar]', { workflow: 'event_link_confirm', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to link calendar event' }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const eventId = eventIdFromParams(params);
  if (!eventId) return json({ ok: false, error: 'eventId is required' }, 400);

  const admin = getServiceRoleClient();
  if (!admin) return json({ ok: false, error: 'Server misconfigured' }, 500);

  try {
    // Unlink only needs connection id — do not refresh Google tokens.
    const connection = await loadConnectionForProfile(gate.userId, admin);
    if (!connection) {
      return json(
        { ok: false, error: 'Google Workspace is not connected', code: 'not_connected' },
        409,
      );
    }
    const deleted = await deleteCalendarEventLink({
      client: gate.supabase,
      googleConnectionId: connection.id,
      googleEventId: eventId,
      calendarId: PRIMARY_CALENDAR_ID,
    });
    return json({ ok: true, deleted });
  } catch (err) {
    if (err instanceof GoogleTokenStoreError) {
      return json({ ok: false, error: 'Server misconfigured' }, 500);
    }
    if (err instanceof CalendarEventLinkError) {
      return json({ ok: false, error: err.message }, 500);
    }
    console.error('[calendar]', { workflow: 'event_link_delete', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to unlink calendar event' }, 500);
  }
};
