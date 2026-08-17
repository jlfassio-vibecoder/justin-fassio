import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useOptionalLineContext } from '@/lib/lineContext';
import {
  listCalendarLinksForProspectClient,
  unlinkCalendarEventClient,
} from '@/lib/calendarClientBrowser';
import type { CalendarEventLinkPublic } from '@/lib/google/calendarEventLinks';

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export type AccountCalendarSectionProps = {
  prospectId: number;
  onScheduleMeeting?: () => void;
  refreshKey?: number;
};

/** Confirmed calendar event links for a prospect/account drawer (cache metadata only). */
export function AccountCalendarSection({
  prospectId,
  onScheduleMeeting,
  refreshKey = 0,
}: AccountCalendarSectionProps) {
  const line = useOptionalLineContext();
  const salesLineId = line.multiLineUi ? line.salesLineId : null;
  const [links, setLinks] = useState<CalendarEventLinkPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      const result = await listCalendarLinksForProspectClient(prospectId, salesLineId);
      if (!active) return;
      if (!result.ok) {
        setLinks([]);
        setError(result.error);
        setLoading(false);
        return;
      }
      setLinks(result.links);
      setError(null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [prospectId, refreshKey, salesLineId]);

  async function handleUnlink(link: CalendarEventLinkPublic) {
    setBusyId(link.id);
    setError(null);
    const result = await unlinkCalendarEventClient(link.googleEventId);
    setBusyId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLinks((prev) => prev.filter((row) => row.id !== link.id));
  }

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading m-0 text-sm tracking-wide uppercase">Meetings (Calendar)</h3>
        {onScheduleMeeting ? (
          <Button type="button" variant="secondary" onClick={onScheduleMeeting}>
            Schedule meeting
          </Button>
        ) : null}
      </div>
      <p className="text-ink/55 m-0 text-xs">
        Confirmed Calendar links only. Google Calendar is the source of truth; times below are a
        cache.
      </p>
      {loading ? <p className="text-ink/60 m-0 text-xs">Loading linked meetings…</p> : null}
      {error ? (
        <p className="text-accent-800 m-0 text-xs" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && !error && links.length === 0 ? (
        <p className="text-ink/60 m-0 text-xs">No confirmed meetings linked to this record.</p>
      ) : null}
      {!loading && !error && links.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {links.map((link) => (
            <li
              key={link.id}
              className="border-ink/10 bg-surface rounded-md border px-3 py-2 text-sm"
            >
              <p className="font-heading text-ink m-0 truncate">{link.title || '(no title)'}</p>
              <p className="text-ink/55 m-0 mt-0.5 text-xs">
                {formatWhen(link.startAt)}
                {link.attendees.length > 0 ? ` · ${link.attendees.slice(0, 3).join(', ')}` : ''}
              </p>
              {link.meetUrl ? (
                <p className="m-0 mt-1 text-xs">
                  <a href={link.meetUrl} target="_blank" rel="noreferrer" className="text-accent">
                    Join Meet
                  </a>
                </p>
              ) : null}
              <div className="mt-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busyId === link.id}
                  onClick={() => void handleUnlink(link)}
                >
                  Unlink
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
