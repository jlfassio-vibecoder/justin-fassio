import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { CalendarEventLinkPublic } from '@/lib/google/calendarEventLinks';
import {
  confirmCalendarEventLinkClient,
  getCalendarEventLinkStateClient,
  unlinkCalendarEventClient,
} from '@/lib/calendarClientBrowser';
import { searchProspectsForMapping } from '@/lib/messages';
import type { Prospect } from '@/lib/prospects';

export type CalendarEventLinkFormProps = {
  eventId: string;
  onLinked?: (link: CalendarEventLinkPublic) => void;
  onUnlinked?: () => void;
};

export function CalendarEventLinkForm({
  eventId,
  onLinked,
  onUnlinked,
}: CalendarEventLinkFormProps) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<CalendarEventLinkPublic | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Prospect[]>([]);
  const [selectedProspectId, setSelectedProspectId] = useState<number | null>(null);

  const trimmedQuery = query.trim();
  const visibleHits = trimmedQuery.length >= 2 ? hits : [];

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError(null);
      const result = await getCalendarEventLinkStateClient(eventId);
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setLink(result.link);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [eventId]);

  useEffect(() => {
    if (trimmedQuery.length < 2) return;

    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        const result = await searchProspectsForMapping(trimmedQuery);
        if (!active) return;
        if (result.error) {
          setError(result.error);
          setHits([]);
          return;
        }
        setError(null);
        setHits(result.data);
      })();
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [trimmedQuery]);

  async function confirmLink(prospectId: number) {
    setBusy(true);
    setError(null);
    const result = await confirmCalendarEventLinkClient({
      eventId,
      prospectId,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLink(result.link);
    onLinked?.(result.link);
  }

  async function handleUnlink() {
    setBusy(true);
    setError(null);
    const result = await unlinkCalendarEventClient(eventId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLink(null);
    onUnlinked?.();
  }

  if (loading) {
    return <p className="text-ink/60 m-0 text-xs">Checking CRM link…</p>;
  }

  if (link?.linkStatus === 'confirmed' && link.prospectId != null) {
    return (
      <div className="border-ink/10 bg-bg flex flex-col gap-2 rounded-md border px-3 py-2">
        <p className="text-ink m-0 text-sm">
          Linked to CRM #{link.prospectId}
          {link.title ? <span className="text-ink/55"> · {link.title}</span> : null}
        </p>
        <div>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void handleUnlink()}>
            Unlink
          </Button>
        </div>
        {error ? (
          <p className="text-accent-800 m-0 text-xs" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="border-ink/10 bg-bg flex flex-col gap-2 rounded-md border px-3 py-2">
      <p className="text-ink/70 m-0 text-xs">
        Link this calendar event to a prospect or account. Nothing is saved until you confirm.
      </p>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink/70">Search prospect / account</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="border-ink/15 bg-surface text-ink rounded-md border px-3 py-2 text-sm"
          placeholder="Name or city…"
        />
      </label>

      {visibleHits.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {visibleHits.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="border-ink/10 hover:bg-ink/[0.04] w-full rounded-md border px-2 py-1.5 text-left text-sm"
                onClick={() => {
                  setSelectedProspectId(p.id);
                  setQuery(p.name);
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

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={busy || selectedProspectId == null}
          onClick={() => {
            if (selectedProspectId == null) return;
            void confirmLink(selectedProspectId);
          }}
        >
          Link to CRM
        </Button>
      </div>

      {error ? (
        <p className="text-accent-800 m-0 text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
