import { describe, expect, it } from 'vitest';
import { CalendarClientError } from '@/lib/google/calendarClient';
import { calendarClientErrorToClientMessage } from '@/lib/google/calendarErrors';

describe('calendarClientErrorToClientMessage', () => {
  it('maps API-not-enabled errors', () => {
    const err = new CalendarClientError(
      'Google Calendar API has not been used in project 123 before or it is disabled.',
      403,
    );
    const mapped = calendarClientErrorToClientMessage(err, 'fallback');
    expect(mapped.error).toMatch(/Calendar API is not enabled/i);
  });

  it('maps insufficient scope errors to reconnect', () => {
    const err = new CalendarClientError('Request had insufficient authentication scopes.', 403);
    const mapped = calendarClientErrorToClientMessage(err, 'fallback');
    expect(mapped.needsReconnect).toBe(true);
    expect(mapped.needsCalendarEvents).toBe(true);
    expect(mapped.error).toMatch(/reconnect/i);
  });

  it('maps quota / rate limit to 429 copy', () => {
    const err = new CalendarClientError('Quota exceeded for quota metric', 429);
    const mapped = calendarClientErrorToClientMessage(err, 'fallback');
    expect(mapped.httpStatus).toBe(429);
    expect(mapped.error).toMatch(/rate limit/i);
  });

  it('keeps generic fallback for unknown errors', () => {
    const err = new CalendarClientError('Something odd', 500);
    expect(calendarClientErrorToClientMessage(err, 'Failed to load calendar events')).toEqual({
      error: 'Failed to load calendar events',
    });
  });
});
