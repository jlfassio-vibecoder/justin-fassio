import type { CalendarEventSummary } from '@/lib/google/calendarTypes';

function formatWhen(event: CalendarEventSummary): string {
  try {
    if (event.allDay) {
      return `${event.start} → ${event.end} (all day)`;
    }
    const start = new Date(event.start);
    const end = new Date(event.end);
    const opts: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    };
    return `${start.toLocaleString(undefined, opts)} – ${end.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  } catch {
    return `${event.start} – ${event.end}`;
  }
}

export type CalendarAgendaProps = {
  events: CalendarEventSummary[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (event: CalendarEventSummary) => void;
};

export function CalendarAgenda({
  events,
  loading,
  error,
  selectedId,
  onSelect,
}: CalendarAgendaProps) {
  if (loading) {
    return <p className="text-ink/60 m-0 text-sm">Loading upcoming events…</p>;
  }
  if (error) {
    return (
      <p className="text-accent-800 m-0 text-sm" role="alert">
        {error}
      </p>
    );
  }
  if (events.length === 0) {
    return <p className="text-ink/60 m-0 text-sm">No upcoming events on the primary calendar.</p>;
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {events.map((event) => {
        const selected = event.id === selectedId;
        return (
          <li key={event.id}>
            <button
              type="button"
              onClick={() => onSelect(event)}
              className={
                selected
                  ? 'border-accent bg-accent/5 w-full rounded-md border px-3 py-2.5 text-left'
                  : 'border-ink/10 bg-surface hover:bg-ink/[0.03] w-full rounded-md border px-3 py-2.5 text-left'
              }
            >
              <p className="font-heading text-ink m-0 truncate text-sm">{event.title}</p>
              <p className="text-ink/55 m-0 mt-0.5 text-xs">{formatWhen(event)}</p>
              <p className="text-ink/50 m-0 mt-1 text-xs">
                {event.attendees.length > 0
                  ? `${event.attendees.length} attendee${event.attendees.length === 1 ? '' : 's'}`
                  : 'No attendees'}
                {event.meetUrl ? ' · Meet' : ''}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
