import { randomBytes } from 'node:crypto';
import type {
  CalendarAttendee,
  CalendarEventDetail,
  CalendarEventSummary,
  CalendarEventWriteInput,
} from '@/lib/google/calendarTypes';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const PRIMARY = 'primary';
const MAX_RESULTS_CAP = 50;

export class CalendarClientError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'CalendarClientError';
    this.status = status;
  }
}

type GoogleDate = { date?: string; dateTime?: string; timeZone?: string };
type GoogleAttendee = {
  email?: string;
  displayName?: string;
  responseStatus?: string;
};
type GoogleEntryPoint = { entryPointType?: string; uri?: string };
type GoogleConferenceData = {
  entryPoints?: GoogleEntryPoint[];
  createRequest?: { requestId?: string; conferenceSolutionKey?: { type?: string } };
};
type GoogleEvent = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  htmlLink?: string;
  start?: GoogleDate;
  end?: GoogleDate;
  attendees?: GoogleAttendee[];
  conferenceData?: GoogleConferenceData;
};

type GoogleEventsListResponse = {
  items?: GoogleEvent[];
  nextPageToken?: string;
};

function meetRequestId(): string {
  return randomBytes(12).toString('hex');
}

function extractMeetUrl(conference: GoogleConferenceData | undefined): string | null {
  const video = conference?.entryPoints?.find(
    (ep) => (ep.entryPointType ?? '').toLowerCase() === 'video' && ep.uri,
  );
  return video?.uri?.trim() || null;
}

function mapAttendees(attendees: GoogleAttendee[] | undefined): CalendarAttendee[] {
  if (!attendees?.length) return [];
  const out: CalendarAttendee[] = [];
  for (const a of attendees) {
    const email = a.email?.trim().toLowerCase();
    if (!email) continue;
    out.push({
      email,
      displayName: a.displayName?.trim() || null,
      responseStatus: a.responseStatus?.trim() || null,
    });
  }
  return out;
}

function mapEventTiming(
  start: GoogleDate | undefined,
  end: GoogleDate | undefined,
): {
  start: string;
  end: string;
  allDay: boolean;
} {
  if (start?.date || end?.date) {
    return {
      start: start?.date ?? '',
      end: end?.date ?? '',
      allDay: true,
    };
  }
  return {
    start: start?.dateTime ?? '',
    end: end?.dateTime ?? '',
    allDay: false,
  };
}

function toSummary(event: GoogleEvent): CalendarEventSummary | null {
  if (!event.id) return null;
  const timing = mapEventTiming(event.start, event.end);
  return {
    id: event.id,
    title: event.summary?.trim() || '(no title)',
    start: timing.start,
    end: timing.end,
    allDay: timing.allDay,
    status: event.status ?? null,
    meetUrl: extractMeetUrl(event.conferenceData),
    attendees: mapAttendees(event.attendees),
    htmlLink: event.htmlLink ?? null,
  };
}

function toDetail(event: GoogleEvent): CalendarEventDetail | null {
  const summary = toSummary(event);
  if (!summary) return null;
  return {
    ...summary,
    description: event.description?.trim() || null,
    location: event.location?.trim() || null,
  };
}

function buildEventBody(input: CalendarEventWriteInput): GoogleEvent {
  const allDay = Boolean(input.allDay);
  const body: GoogleEvent = {
    summary: input.title.trim(),
    description: input.description?.trim() || undefined,
    location: input.location?.trim() || undefined,
  };
  if (allDay) {
    body.start = { date: input.start };
    body.end = { date: input.end };
  } else {
    body.start = { dateTime: input.start };
    body.end = { dateTime: input.end };
  }
  const emails = (input.attendeeEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  const unique = [...new Set(emails)];
  if (unique.length > 0) {
    body.attendees = unique.map((email) => ({ email }));
  }
  if (input.createMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: meetRequestId(),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }
  return body;
}

async function calendarFetch(params: {
  accessToken: string;
  path: string;
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  fetchImpl?: typeof fetch;
}): Promise<unknown> {
  const url = new URL(`${CALENDAR_API}${params.path}`);
  for (const [key, value] of Object.entries(params.query ?? {})) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }
  const fetchImpl = params.fetchImpl ?? fetch;
  const res = await fetchImpl(url.toString(), {
    method: params.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      ...(params.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: params.body !== undefined ? JSON.stringify(params.body) : undefined,
  });
  if (res.status === 204) return null;
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    message?: string;
  };
  if (!res.ok) {
    throw new CalendarClientError(
      json.error?.message || json.message || `Calendar API failed (${res.status})`,
      res.status,
    );
  }
  return json;
}

export async function listUpcomingEvents(params: {
  accessToken: string;
  timeMin?: string;
  maxResults?: number;
  pageToken?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ events: CalendarEventSummary[]; nextPageToken: string | null }> {
  const maxResults = Math.min(Math.max(params.maxResults ?? 25, 1), MAX_RESULTS_CAP);
  const json = (await calendarFetch({
    accessToken: params.accessToken,
    path: `/calendars/${PRIMARY}/events`,
    query: {
      timeMin: params.timeMin ?? new Date().toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults,
      pageToken: params.pageToken,
    },
    fetchImpl: params.fetchImpl,
  })) as GoogleEventsListResponse;

  const events: CalendarEventSummary[] = [];
  for (const item of json.items ?? []) {
    const mapped = toSummary(item);
    if (mapped) events.push(mapped);
  }
  return { events, nextPageToken: json.nextPageToken ?? null };
}

export async function getCalendarEvent(params: {
  accessToken: string;
  eventId: string;
  fetchImpl?: typeof fetch;
}): Promise<CalendarEventDetail> {
  const json = (await calendarFetch({
    accessToken: params.accessToken,
    path: `/calendars/${PRIMARY}/events/${encodeURIComponent(params.eventId)}`,
    fetchImpl: params.fetchImpl,
  })) as GoogleEvent;
  const detail = toDetail(json);
  if (!detail) throw new CalendarClientError('Calendar event missing id');
  return detail;
}

export async function createCalendarEvent(params: {
  accessToken: string;
  input: CalendarEventWriteInput;
  fetchImpl?: typeof fetch;
}): Promise<CalendarEventDetail> {
  const json = (await calendarFetch({
    accessToken: params.accessToken,
    path: `/calendars/${PRIMARY}/events`,
    method: 'POST',
    query: {
      conferenceDataVersion: 1,
      sendUpdates: 'all',
    },
    body: buildEventBody(params.input),
    fetchImpl: params.fetchImpl,
  })) as GoogleEvent;
  const detail = toDetail(json);
  if (!detail) throw new CalendarClientError('Created event missing id');
  return detail;
}

export async function updateCalendarEvent(params: {
  accessToken: string;
  eventId: string;
  input: CalendarEventWriteInput;
  fetchImpl?: typeof fetch;
}): Promise<CalendarEventDetail> {
  const json = (await calendarFetch({
    accessToken: params.accessToken,
    path: `/calendars/${PRIMARY}/events/${encodeURIComponent(params.eventId)}`,
    method: 'PATCH',
    query: {
      conferenceDataVersion: 1,
      sendUpdates: 'all',
    },
    body: buildEventBody(params.input),
    fetchImpl: params.fetchImpl,
  })) as GoogleEvent;
  const detail = toDetail(json);
  if (!detail) throw new CalendarClientError('Updated event missing id');
  return detail;
}

export async function cancelCalendarEvent(params: {
  accessToken: string;
  eventId: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  await calendarFetch({
    accessToken: params.accessToken,
    path: `/calendars/${PRIMARY}/events/${encodeURIComponent(params.eventId)}`,
    method: 'DELETE',
    query: { sendUpdates: 'all' },
    fetchImpl: params.fetchImpl,
  });
}
