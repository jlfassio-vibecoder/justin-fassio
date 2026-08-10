import type {
  CalendarEventDetail,
  CalendarEventSummary,
  CalendarEventWriteInput,
} from '@/lib/google/calendarTypes';
import { supabase } from '@/lib/supabase';

async function staffBearer(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

type GateFlags = {
  needsCalendarEvents?: boolean;
  needsConnect?: boolean;
  needsReconnect?: boolean;
};

function gateFromBody(body: GateFlags): GateFlags {
  return {
    needsCalendarEvents: body.needsCalendarEvents,
    needsConnect: body.needsConnect,
    needsReconnect: body.needsReconnect,
  };
}

export type ListCalendarEventsResult =
  | {
      ok: true;
      events: CalendarEventSummary[];
      nextPageToken: string | null;
    }
  | ({ ok: false; error: string } & GateFlags);

export async function listCalendarEventsClient(params?: {
  maxResults?: number;
  pageToken?: string;
  timeMin?: string;
}): Promise<ListCalendarEventsResult> {
  const token = await staffBearer();
  if (!token) return { ok: false, error: 'Not signed in' };

  const url = new URL('/api/staff/calendar/events', window.location.origin);
  if (params?.maxResults != null) url.searchParams.set('maxResults', String(params.maxResults));
  if (params?.pageToken) url.searchParams.set('pageToken', params.pageToken);
  if (params?.timeMin) url.searchParams.set('timeMin', params.timeMin);

  const res = await fetch(url.pathname + url.search, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as {
    ok?: boolean;
    events?: CalendarEventSummary[];
    nextPageToken?: string | null;
    error?: string;
  } & GateFlags;
  if (!res.ok || !body.ok || !body.events) {
    return {
      ok: false,
      error: body.error ?? 'Failed to load calendar events',
      ...gateFromBody(body),
    };
  }
  return {
    ok: true,
    events: body.events,
    nextPageToken: body.nextPageToken ?? null,
  };
}

export async function getCalendarEventClient(
  eventId: string,
): Promise<{ ok: true; event: CalendarEventDetail } | ({ ok: false; error: string } & GateFlags)> {
  const token = await staffBearer();
  if (!token) return { ok: false, error: 'Not signed in' };

  const res = await fetch(`/api/staff/calendar/events/${encodeURIComponent(eventId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as {
    ok?: boolean;
    event?: CalendarEventDetail;
    error?: string;
  } & GateFlags;
  if (!res.ok || !body.ok || !body.event) {
    return {
      ok: false,
      error: body.error ?? 'Failed to load calendar event',
      ...gateFromBody(body),
    };
  }
  return { ok: true, event: body.event };
}

export async function createCalendarEventClient(
  input: CalendarEventWriteInput,
): Promise<{ ok: true; event: CalendarEventDetail } | ({ ok: false; error: string } & GateFlags)> {
  const token = await staffBearer();
  if (!token) return { ok: false, error: 'Not signed in' };

  const res = await fetch('/api/staff/calendar/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    event?: CalendarEventDetail;
    error?: string;
  } & GateFlags;
  if (!res.ok || !body.ok || !body.event) {
    return {
      ok: false,
      error: body.error ?? 'Failed to create calendar event',
      ...gateFromBody(body),
    };
  }
  return { ok: true, event: body.event };
}

export async function updateCalendarEventClient(
  eventId: string,
  input: CalendarEventWriteInput,
): Promise<{ ok: true; event: CalendarEventDetail } | ({ ok: false; error: string } & GateFlags)> {
  const token = await staffBearer();
  if (!token) return { ok: false, error: 'Not signed in' };

  const res = await fetch(`/api/staff/calendar/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    event?: CalendarEventDetail;
    error?: string;
  } & GateFlags;
  if (!res.ok || !body.ok || !body.event) {
    return {
      ok: false,
      error: body.error ?? 'Failed to update calendar event',
      ...gateFromBody(body),
    };
  }
  return { ok: true, event: body.event };
}

export async function cancelCalendarEventClient(
  eventId: string,
): Promise<{ ok: true } | ({ ok: false; error: string } & GateFlags)> {
  const token = await staffBearer();
  if (!token) return { ok: false, error: 'Not signed in' };

  const res = await fetch(`/api/staff/calendar/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { ok?: boolean; error?: string } & GateFlags;
  if (!res.ok || !body.ok) {
    return {
      ok: false,
      error: body.error ?? 'Failed to cancel calendar event',
      ...gateFromBody(body),
    };
  }
  return { ok: true };
}
