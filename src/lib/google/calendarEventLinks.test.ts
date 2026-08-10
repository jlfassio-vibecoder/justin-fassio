import { describe, expect, it } from 'vitest';
import {
  toPublicCalendarEventLink,
  type CalendarEventLinkRow,
} from '@/lib/google/calendarEventLinks';

const row: CalendarEventLinkRow = {
  id: 'link-1',
  google_connection_id: 'conn-1',
  calendar_id: 'primary',
  google_event_id: 'ev-1',
  prospect_id: 42,
  account_contact_id: 'contact-1',
  link_status: 'confirmed',
  title: 'Buyer call',
  start_at: '2026-08-11T16:00:00.000Z',
  end_at: '2026-08-11T16:30:00.000Z',
  meet_url: 'https://meet.google.com/abc',
  attendees: ['a@example.com', 'b@example.com'],
  created_at: '2026-08-09T00:00:00.000Z',
  updated_at: '2026-08-09T12:00:00.000Z',
};

describe('toPublicCalendarEventLink', () => {
  it('maps row without secrets', () => {
    const pub = toPublicCalendarEventLink(row);
    expect(pub).toEqual({
      id: 'link-1',
      googleConnectionId: 'conn-1',
      calendarId: 'primary',
      googleEventId: 'ev-1',
      prospectId: 42,
      accountContactId: 'contact-1',
      linkStatus: 'confirmed',
      title: 'Buyer call',
      startAt: '2026-08-11T16:00:00.000Z',
      endAt: '2026-08-11T16:30:00.000Z',
      meetUrl: 'https://meet.google.com/abc',
      attendees: ['a@example.com', 'b@example.com'],
    });
    expect(JSON.stringify(pub)).not.toMatch(/refresh_token|ciphertext/i);
  });
});
