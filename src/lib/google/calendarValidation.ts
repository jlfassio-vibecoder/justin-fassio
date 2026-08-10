import type { CalendarEventWriteInput } from '@/lib/google/calendarTypes';

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export class CalendarValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarValidationError';
  }
}

function normalizeEmails(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const email = item.trim().toLowerCase();
    if (!email) continue;
    if (!EMAIL_RE.test(email)) {
      throw new CalendarValidationError(`Invalid attendee email: ${item}`);
    }
    if (!out.includes(email)) out.push(email);
  }
  return out;
}

/** Parse create/update JSON body into a CalendarEventWriteInput. */
export function parseCalendarEventWriteBody(body: unknown): CalendarEventWriteInput {
  if (body == null || typeof body !== 'object') {
    throw new CalendarValidationError('Invalid JSON body');
  }
  const raw = body as Record<string, unknown>;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title) throw new CalendarValidationError('title is required');

  const start = typeof raw.start === 'string' ? raw.start.trim() : '';
  const end = typeof raw.end === 'string' ? raw.end.trim() : '';
  if (!start || !end) throw new CalendarValidationError('start and end are required');

  const allDay = raw.allDay === true;
  if (allDay) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      throw new CalendarValidationError('all-day start/end must be YYYY-MM-DD');
    }
    // Google all-day end.date is exclusive, so end must be after start.
    if (end <= start) {
      throw new CalendarValidationError('end must be after start');
    }
  } else {
    if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
      throw new CalendarValidationError('start and end must be valid ISO datetimes');
    }
    if (Date.parse(end) <= Date.parse(start)) {
      throw new CalendarValidationError('end must be after start');
    }
  }

  const description = typeof raw.description === 'string' ? raw.description.trim() || null : null;
  const location = typeof raw.location === 'string' ? raw.location.trim() || null : null;

  return {
    title,
    start,
    end,
    allDay,
    description,
    location,
    attendeeEmails: normalizeEmails(raw.attendeeEmails),
    createMeet: raw.createMeet === true,
  };
}
