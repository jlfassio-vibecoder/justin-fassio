import { useEffect, useState, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { fetchContactsForAccount, type AccountContact } from '@/lib/accountContacts';
import type { CalendarEventDetail, CalendarEventWriteInput } from '@/lib/google/calendarTypes';
import { searchProspectsForMapping } from '@/lib/messages';
import type { Prospect } from '@/lib/prospects';

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

function parseAttendeeEmails(text: string): string[] {
  return text
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function mergeEmails(existing: string[], add: string[]): string[] {
  const seen = new Set(existing.map((e) => e.toLowerCase()));
  const out = [...existing];
  for (const email of add) {
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

function contactsWithEmail(contacts: AccountContact[]): AccountContact[] {
  return contacts.filter((c) => Boolean(c.email?.trim()));
}

function defaultSelectedContactIds(contacts: AccountContact[]): string[] {
  const withEmail = contactsWithEmail(contacts);
  if (withEmail.length === 0) return [];
  if (withEmail.length <= 4) return withEmail.map((c) => c.id);
  const primary = withEmail.find((c) => c.isPrimary);
  return primary ? [primary.id] : [withEmail[0].id];
}

export type CalendarEventFormSubmit = CalendarEventWriteInput & {
  prospectId?: number | null;
  accountContactId?: string | null;
};

export type CalendarEventFormProps = {
  mode: 'create' | 'edit';
  initial?: CalendarEventDetail | null;
  busy: boolean;
  error: string | null;
  onSubmit: (input: CalendarEventFormSubmit) => void;
  onCancel: () => void;
  onDelete?: () => void;
  /** Show CRM prospect/contact picker (create flows). */
  showCrmAssociation?: boolean;
  /** Lock association to this prospect (drawer Schedule meeting). */
  lockedProspectId?: number | null;
  lockedProspectName?: string | null;
  /** Override default Meet checkbox (drawer defaults on). */
  defaultCreateMeet?: boolean;
};

export function CalendarEventForm({
  mode,
  initial,
  busy,
  error,
  onSubmit,
  onCancel,
  onDelete,
  showCrmAssociation = false,
  lockedProspectId = null,
  lockedProspectName = null,
  defaultCreateMeet,
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
  const [createMeet, setCreateMeet] = useState(() => defaultCreateMeet ?? !initial?.meetUrl);

  const [prospectQuery, setProspectQuery] = useState(() => lockedProspectName ?? '');
  const [prospectHits, setProspectHits] = useState<Prospect[]>([]);
  const [pickedProspectId, setPickedProspectId] = useState<number | null>(null);
  const [contacts, setContacts] = useState<AccountContact[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [crmError, setCrmError] = useState<string | null>(null);

  const selectedProspectId = lockedProspectId ?? pickedProspectId;
  const trimmedProspectQuery = prospectQuery.trim();
  const visibleProspectHits =
    lockedProspectId == null && trimmedProspectQuery.length >= 2 ? prospectHits : [];
  const emailContacts = selectedProspectId == null ? [] : contactsWithEmail(contacts);

  useEffect(() => {
    if (!showCrmAssociation || lockedProspectId != null) return;
    if (trimmedProspectQuery.length < 2) return;

    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        const result = await searchProspectsForMapping(trimmedProspectQuery);
        if (!active) return;
        if (result.error) {
          setCrmError(result.error);
          setProspectHits([]);
          return;
        }
        setCrmError(null);
        setProspectHits(result.data);
      })();
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [showCrmAssociation, lockedProspectId, trimmedProspectQuery]);

  useEffect(() => {
    if (!showCrmAssociation || selectedProspectId == null) return;

    let active = true;
    void (async () => {
      setContactsLoading(true);
      const result = await fetchContactsForAccount(selectedProspectId);
      if (!active) return;
      setContactsLoading(false);
      if (result.error) {
        setCrmError(result.error);
        setContacts([]);
        setSelectedContactIds([]);
        return;
      }
      setCrmError(null);
      setContacts(result.data);
      const defaultsIds = defaultSelectedContactIds(result.data);
      setSelectedContactIds(defaultsIds);
      const emails = contactsWithEmail(result.data)
        .filter((c) => defaultsIds.includes(c.id))
        .map((c) => c.email!.trim());
      if (emails.length > 0) {
        setAttendeesText((prev) => mergeEmails(parseAttendeeEmails(prev), emails).join(', '));
      }
    })();
    return () => {
      active = false;
    };
  }, [showCrmAssociation, selectedProspectId]);

  function toggleContact(contact: AccountContact) {
    const email = contact.email?.trim();
    setSelectedContactIds((prev) => {
      const next = prev.includes(contact.id)
        ? prev.filter((id) => id !== contact.id)
        : [...prev, contact.id];
      if (email) {
        setAttendeesText((text) => {
          const current = parseAttendeeEmails(text);
          if (next.includes(contact.id)) {
            return mergeEmails(current, [email]).join(', ');
          }
          return current.filter((e) => e.toLowerCase() !== email.toLowerCase()).join(', ');
        });
      }
      return next;
    });
  }

  function resolveAccountContactId(): string | null {
    if (selectedContactIds.length === 0) return null;
    const selected = contacts.filter((c) => selectedContactIds.includes(c.id));
    const primary = selected.find((c) => c.isPrimary);
    return (primary ?? selected[0])?.id ?? null;
  }

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const attendeeEmails = parseAttendeeEmails(attendeesText);
    onSubmit({
      title: title.trim(),
      start: fromLocalInputValue(startLocal, allDay),
      end: fromLocalInputValue(endLocal, allDay),
      allDay,
      description: description.trim() || null,
      location: location.trim() || null,
      attendeeEmails,
      createMeet: mode === 'create' ? createMeet : createMeet && !initial?.meetUrl,
      prospectId: showCrmAssociation ? selectedProspectId : null,
      accountContactId: showCrmAssociation ? resolveAccountContactId() : null,
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

      {showCrmAssociation ? (
        <div className="border-ink/10 bg-bg flex flex-col gap-2 rounded-md border px-3 py-2">
          <p className="text-ink/70 m-0 text-xs">
            Optional CRM link. Selecting contacts merges their emails into attendees.
          </p>
          {lockedProspectId != null ? (
            <p className="text-ink m-0 text-sm">
              {lockedProspectName ?? `CRM #${lockedProspectId}`}
            </p>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink/70">Prospect / account</span>
                <input
                  type="search"
                  value={prospectQuery}
                  onChange={(e) => {
                    setProspectQuery(e.target.value);
                    setPickedProspectId(null);
                  }}
                  className="border-ink/15 bg-surface text-ink rounded-md border px-3 py-2 text-sm"
                  placeholder="Search name or city…"
                />
              </label>
              {visibleProspectHits.length > 0 ? (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {visibleProspectHits.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="border-ink/10 hover:bg-ink/[0.04] w-full rounded-md border px-2 py-1.5 text-left text-sm"
                        onClick={() => {
                          setPickedProspectId(p.id);
                          setProspectQuery(p.name);
                          setProspectHits([]);
                        }}
                      >
                        {p.name}
                        <span className="text-ink/55">
                          {' '}
                          · {p.accountStatus}
                          {p.city ? ` · ${p.city}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}

          {selectedProspectId != null ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-ink/55 m-0 text-xs uppercase">Contacts with email</p>
              {contactsLoading ? (
                <p className="text-ink/60 m-0 text-xs">Loading contacts…</p>
              ) : null}
              {!contactsLoading && emailContacts.length === 0 ? (
                <p className="text-ink/55 m-0 text-xs">No contacts with email on this record.</p>
              ) : null}
              {emailContacts.map((c) => (
                <label key={c.id} className="text-ink flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selectedContactIds.includes(c.id)}
                    onChange={() => toggleContact(c)}
                  />
                  <span>
                    {c.fullName}
                    {c.isPrimary ? ' · primary' : ''}
                    <span className="text-ink/55"> · {c.email}</span>
                  </span>
                </label>
              ))}
            </div>
          ) : null}

          {crmError ? (
            <p className="text-accent-800 m-0 text-xs" role="alert">
              {crmError}
            </p>
          ) : null}
        </div>
      ) : null}

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
