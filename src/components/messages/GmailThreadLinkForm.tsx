import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { CrmEmailMatch } from '@/lib/google/crmEmailMatch';
import type { GmailThreadLinkPublic } from '@/lib/google/gmailThreadLinks';
import {
  confirmGmailThreadLinkClient,
  getGmailThreadLinkStateClient,
  unlinkGmailThreadClient,
} from '@/lib/gmailClientBrowser';
import { searchProspectsForMapping } from '@/lib/messages';
import type { Prospect } from '@/lib/prospects';

export type GmailThreadLinkFormProps = {
  threadId: string;
  onLinked?: (link: GmailThreadLinkPublic) => void;
  onUnlinked?: () => void;
};

export function GmailThreadLinkForm({ threadId, onLinked, onUnlinked }: GmailThreadLinkFormProps) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CrmEmailMatch[]>([]);
  const [link, setLink] = useState<GmailThreadLinkPublic | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Prospect[]>([]);
  const [selectedProspectId, setSelectedProspectId] = useState<number | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  const trimmedQuery = query.trim();
  const visibleHits = trimmedQuery.length >= 2 ? hits : [];

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError(null);
      const result = await getGmailThreadLinkStateClient(threadId);
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setSuggestions(result.suggestions);
      setLink(result.link);
      if (result.suggestions[0]) {
        setSelectedProspectId(result.suggestions[0].prospectId);
        setSelectedContactId(result.suggestions[0].accountContactId);
        setQuery(result.suggestions[0].prospectName);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [threadId]);

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
        setHits(result.data);
      })();
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [trimmedQuery]);

  async function confirmLink(prospectId: number, accountContactId?: string | null) {
    setBusy(true);
    setError(null);
    const result = await confirmGmailThreadLinkClient({
      threadId,
      prospectId,
      accountContactId,
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
    const result = await unlinkGmailThreadClient(threadId);
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
          {link.subject ? <span className="text-ink/55"> · {link.subject}</span> : null}
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

  const uniqueSuggestions = suggestions.filter(
    (s, i, arr) => arr.findIndex((x) => x.prospectId === s.prospectId) === i,
  );

  return (
    <div className="border-ink/10 bg-bg flex flex-col gap-2 rounded-md border px-3 py-2">
      <p className="text-ink/70 m-0 text-xs">
        Link this Gmail thread to a prospect or account. Suggestions match contact emails only —
        nothing is saved until you confirm.
      </p>

      {uniqueSuggestions.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-ink/55 m-0 text-xs uppercase">Suggested</p>
          {uniqueSuggestions.map((s) => (
            <div
              key={`${s.prospectId}-${s.accountContactId}`}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <button
                type="button"
                className="text-ink m-0 text-left text-sm"
                onClick={() => {
                  setSelectedProspectId(s.prospectId);
                  setSelectedContactId(s.accountContactId);
                  setQuery(s.prospectName);
                }}
              >
                {s.prospectName}
                <span className="text-ink/55">
                  {' '}
                  · {s.contactName} ({s.email}) · {s.confidence}
                </span>
              </button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void confirmLink(s.prospectId, s.accountContactId)}
              >
                Confirm
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-ink/55 m-0 text-xs">No automatic email matches in CRM contacts.</p>
      )}

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
                  setSelectedContactId(null);
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
            void confirmLink(selectedProspectId, selectedContactId);
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
