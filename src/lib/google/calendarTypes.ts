export type CalendarAttendee = {
  email: string;
  displayName?: string | null;
  responseStatus?: string | null;
};

export type CalendarEventSummary = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  status: string | null;
  meetUrl: string | null;
  attendees: CalendarAttendee[];
  htmlLink: string | null;
};

export type CalendarEventDetail = CalendarEventSummary & {
  description: string | null;
  location: string | null;
};

export type CalendarEventWriteInput = {
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  description?: string | null;
  location?: string | null;
  attendeeEmails?: string[];
  createMeet?: boolean;
};
