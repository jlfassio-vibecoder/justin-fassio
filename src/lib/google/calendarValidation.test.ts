import { describe, expect, it } from 'vitest';
import {
  CalendarValidationError,
  parseCalendarEventWriteBody,
} from '@/lib/google/calendarValidation';

describe('parseCalendarEventWriteBody', () => {
  it('rejects end before or equal to start', () => {
    expect(() =>
      parseCalendarEventWriteBody({
        title: 'Call',
        start: '2026-08-11T16:00:00Z',
        end: '2026-08-11T16:00:00Z',
      }),
    ).toThrow(CalendarValidationError);
  });

  it('trims whitespace-only description and location to null', () => {
    const input = parseCalendarEventWriteBody({
      title: 'Call',
      start: '2026-08-11T16:00:00Z',
      end: '2026-08-11T16:30:00Z',
      description: '   ',
      location: '\t',
    });
    expect(input.description).toBeNull();
    expect(input.location).toBeNull();
  });

  it('requires exclusive end date for all-day events', () => {
    expect(() =>
      parseCalendarEventWriteBody({
        title: 'Offsite',
        allDay: true,
        start: '2026-08-11',
        end: '2026-08-11',
      }),
    ).toThrow(/end must be after start/);
  });
});
