import { useState, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/Button';
import type { CalendarEventDetail, CalendarEventWriteInput } from '@/lib/google/calendarTypes';

function toLocalInputValue(iso: string, allDay: boolean): string {
  if (!iso) return '';
  if (allDay) return iso.slice(0, 10);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value: string, allDay: boolean): string {
  if (allDay) return value;
  const d = new Date(value);
  return d.toISOString();
}

/** Keep start/end usable when switching between date and datetime-local inputs. */
function convertLocalForAllDayToggle(
  value: string,
  toAllDay: boolean,
  role: 'start' | 'end',
): string {
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return value;
  if (toAllDay) return datePart;
  return role === 'start' ? `${datePart}T09:00` : `${datePart}T09:30`;
}

function nextCalendarDate(yyyyMmDd: string): string {
  const d = new Date(`${yyyyMmDd}T12:00:00`);
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function defaultStartEnd(): { start: string; end: string } {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 30);
  return { start: start.toISOString(), end: end.toISOString() };
}

export type CalendarEventFormProps = {
  mode: 'create' | 'edit';
  initial?: CalendarEventDetail | null;
  busy: boolean;
  error: string | null;
  onSubmit: (input: CalendarEventWriteInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
};

export function CalendarEventForm({
  mode,
  initial,
  busy,
  error,
  onSubmit,
  onCancel,
  onDelete,
}: CalendarEventFormProps) {
  const defaults = defaultStartEnd();
  const [title, setTitle] = useState(() => initial?.title ?? '');
  const [allDay, setAllDay] = useState(() => initial?.allDay ?? false);
  const [startLocal, setStartLocal] = useState(() =>
    toLocalInputValue(initial?.start ?? defaults.start, initial?.allDay ?? false),
  );
  const [endLocal, setEndLocal] = useState(() =>
    toLocalInputValue(initial?.end ?? defaults.end, initial?.allDay ?? false),
  );
  const [description, setDescription] = useState(() => initial?.description ?? '');
  const [location, setLocation] = useState(() => initial?.location ?? '');
  const [attendeesText, setAttendeesText] = useState(() =>
    (initial?.attendees ?? []).map((a) => a.email).join(', '),
  );
  const [createMeet, setCreateMeet] = useState(() => !initial?.meetUrl);

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const attendeeEmails = attendeesText
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    onSubmit({
      title: title.trim(),
      start: fromLocalInputValue(startLocal, allDay),
      end: fromLocalInputValue(endLocal, allDay),
      allDay,
      description: description.trim() || null,
      location: location.trim() || null,
      attendeeEmails,
      createMeet: mode === 'create' ? createMeet : createMeet && !initial?.meetUrl,
    });
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading m-0 text-base">
          {mode === 'create' ? 'New event' : 'Edit event'}
        </h3>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Close
        </Button>
      </div>

      {initial?.meetUrl ? (
        <p className="text-ink/60 m-0 text-xs">
          Meet:{' '}
          <a href={initial.meetUrl} target="_blank" rel="noreferrer" className="text-accent">
            {initial.meetUrl}
          </a>
        </p>
      ) : null}

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink/70">Title</span>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="border-ink/15 bg-surface text-ink rounded-md border px-3 py-2 text-sm"
        />
      </label>

      <label className="text-ink/70 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={allDay}
          onChange={(e) => {
            const next = e.target.checked;
            setAllDay(next);
            const nextStart = convertLocalForAllDayToggle(startLocal, next, 'start');
            let nextEnd = convertLocalForAllDayToggle(endLocal, next, 'end');
            // Google all-day end is exclusive — keep end after start when toggling on.
            if (next && nextEnd <= nextStart) {
              nextEnd = nextCalendarDate(nextStart);
            }
            setStartLocal(nextStart);
            setEndLocal(nextEnd);
          }}
        />
        All day
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink/70">Start</span>
          <input
            required
            type={allDay ? 'date' : 'datetime-local'}
            value={startLocal}
            onChange={(e) => setStartLocal(e.target.value)}
            className="border-ink/15 bg-surface text-ink rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink/70">End</span>
          <input
            required
            type={allDay ? 'date' : 'datetime-local'}
            value={endLocal}
            onChange={(e) => setEndLocal(e.target.value)}
            className="border-ink/15 bg-surface text-ink rounded-md border px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink/70">Attendee emails</span>
        <input
          value={attendeesText}
          onChange={(e) => setAttendeesText(e.target.value)}
          placeholder="buyer@example.com, other@example.com"
          className="border-ink/15 bg-surface text-ink rounded-md border px-3 py-2 text-sm"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink/70">Location</span>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="border-ink/15 bg-surface text-ink rounded-md border px-3 py-2 text-sm"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink/70">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="border-ink/15 bg-surface text-ink rounded-md border px-3 py-2 text-sm"
        />
      </label>

      {!initial?.meetUrl ? (
        <label className="text-ink/70 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={createMeet}
            onChange={(e) => setCreateMeet(e.target.checked)}
          />
          Add Google Meet
        </label>
      ) : null}

      {error ? (
        <p className="text-accent-800 m-0 text-xs" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {mode === 'create' ? 'Create event' : 'Save changes'}
        </Button>
        {mode === 'edit' && onDelete ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={onDelete}>
            Cancel event
          </Button>
        ) : null}
      </div>
    </form>
  );
}
