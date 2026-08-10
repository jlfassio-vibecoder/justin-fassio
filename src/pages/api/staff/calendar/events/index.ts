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
      console.error('[calendar]', { workflow: 'list_events', error: 'calendar_failed' });
      return json({ ok: false, error: 'Failed to load calendar events' }, 502);
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
    const { accessToken } = await withCalendarToken(gate.userId);
    const event = await createCalendarEvent({ accessToken, input });
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
      console.error('[calendar]', { workflow: 'create_event', error: 'calendar_failed' });
      return json({ ok: false, error: 'Failed to create calendar event' }, 502);
    }
    console.error('[calendar]', { workflow: 'create_event', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to create calendar event' }, 500);
  }
};
