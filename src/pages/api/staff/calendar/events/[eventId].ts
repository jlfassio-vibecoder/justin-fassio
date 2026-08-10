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
      console.error('[calendar]', { workflow: 'get_event', error: 'calendar_failed' });
      return json({ ok: false, error: 'Failed to load calendar event' }, 502);
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
    const { accessToken } = await withCalendarToken(gate.userId);
    const event = await updateCalendarEvent({ accessToken, eventId, input });
    return json({ ok: true, event });
  } catch (err) {
    if (err instanceof CalendarValidationError) {
      return json({ ok: false, error: err.message }, 400);
    }
    if (err instanceof GoogleAccessTokenError) {
      const mapped = accessTokenErrorToHttp(err);
      return json(mapped.body, mapped.status);
    }
    if (err instanceof CalendarClientError) {
      console.error('[calendar]', { workflow: 'update_event', error: 'calendar_failed' });
      return json({ ok: false, error: 'Failed to update calendar event' }, 502);
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
    const { accessToken } = await withCalendarToken(gate.userId);
    await cancelCalendarEvent({ accessToken, eventId });
    return json({ ok: true, deleted: true });
  } catch (err) {
    if (err instanceof GoogleAccessTokenError) {
      const mapped = accessTokenErrorToHttp(err);
      return json(mapped.body, mapped.status);
    }
    if (err instanceof CalendarClientError) {
      console.error('[calendar]', { workflow: 'cancel_event', error: 'calendar_failed' });
      return json({ ok: false, error: 'Failed to cancel calendar event' }, 502);
    }
    console.error('[calendar]', { workflow: 'cancel_event', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to cancel calendar event' }, 500);
  }
};
