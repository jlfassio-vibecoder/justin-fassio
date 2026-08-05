import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import type { MessagePayload, MessageRow, MessageThread } from '@/lib/messages';
import {
  confirmThreadMapping,
  fetchMessagesForThread,
  fingerprintFromPayload,
  searchProspectsForMapping,
} from '@/lib/messages';
import type { Prospect } from '@/lib/prospects';

interface ConfirmMappingFormProps {
  thread: MessageThread;
  latestPayload: MessagePayload | null;
  onConfirmed: (thread: MessageThread) => void;
}

export function ConfirmMappingForm({
  thread,
  latestPayload,
  onConfirmed,
}: ConfirmMappingFormProps) {
  const [query, setQuery] = useState(
    () => latestPayload?.businessName || thread.businessName || '',
  );
  const [hits, setHits] = useState<Prospect[]>([]);
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedQuery = query.trim();
  const visibleHits = trimmedQuery.length >= 2 ? hits : [];

  useEffect(() => {
    if (trimmedQuery.length < 2) return;

    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        const result = await searchProspectsForMapping(trimmedQuery);
        if (!active) return;
        setSearchBusy(false);
        if (result.error) {
          setError(result.error);
          setHits([]);
          return;
        }
        setError(null);
        setHits(result.data);
      })();
    }, 220);

    // Mark busy after scheduling (async boundary via timeout).
    const busyTimer = window.setTimeout(() => {
      if (active) setSearchBusy(true);
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
      window.clearTimeout(busyTimer);
    };
  }, [trimmedQuery]);

  async function handleConfirm() {
    if (!selected) {
      setError('Select a prospect or active account first.');
      return;
    }
    const fingerprint =
      fingerprintFromPayload(latestPayload ?? {}) || thread.identityFingerprint || null;
    if (!fingerprint) {
      setError('Missing buyer identity on this thread.');
      return;
    }

    setBusy(true);
    setError(null);
    const result = await confirmThreadMapping({
      threadId: thread.id,
      prospectId: selected.id,
      confirmedFingerprint: fingerprint,
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onConfirmed({
      ...thread,
      prospectId: selected.id,
      mappingStatus: 'confirmed',
      confirmedFingerprint: fingerprint,
      prospectName: selected.name,
    });
  }

  return (
    <div className="border-ink/10 bg-bg flex flex-col gap-2.5 rounded-md border p-3">
      <p className="font-heading m-0 text-sm">Confirm account mapping</p>
      <p className="text-ink/65 m-0 text-xs">
        Link this thread to a prospect or active account. Mapping is required before the thread
        appears on their detail drawer.
      </p>
      <label className="text-ink/70 text-xs" htmlFor={`map-search-${thread.id}`}>
        Search prospects / accounts
      </label>
      <input
        id={`map-search-${thread.id}`}
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(null);
        }}
        className="border-ink/15 bg-surface text-ink rounded-md border px-3 py-2 text-sm"
        placeholder="Business name or city…"
      />
      {searchBusy && trimmedQuery.length >= 2 ? (
        <p className="text-ink/60 m-0 text-xs">Searching…</p>
      ) : null}
      {visibleHits.length > 0 ? (
        <ul className="border-ink/10 m-0 max-h-40 list-none overflow-auto rounded-md border p-0">
          {visibleHits.map((hit) => {
            const active = selected?.id === hit.id;
            return (
              <li key={hit.id}>
                <button
                  type="button"
                  onClick={() => setSelected(hit)}
                  className={
                    active
                      ? 'bg-accent/15 w-full px-3 py-2 text-left text-xs'
                      : 'hover:bg-ink/5 w-full px-3 py-2 text-left text-xs'
                  }
                >
                  <span className="font-semibold">{hit.name}</span>
                  <span className="text-ink/60">
                    {' '}
                    · {hit.city} · {hit.accountStatus === 'active_account' ? 'Account' : 'Prospect'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {error ? (
        <p className="text-accent-800 m-0 text-xs" role="alert">
          {error}
        </p>
      ) : null}
      <Button variant="primary" disabled={busy || !selected} onClick={() => void handleConfirm()}>
        {busy ? 'Saving…' : 'Confirm mapping'}
      </Button>
    </div>
  );
}

interface MessageThreadPanelProps {
  thread: MessageThread;
  onThreadUpdated?: (thread: MessageThread) => void;
  /** When true, hide mapping form (e.g. already scoped inside a mapped drawer). */
  hideMappingForm?: boolean;
}

export function MessageThreadPanel({
  thread,
  onThreadUpdated,
  hideMappingForm = false,
}: MessageThreadPanelProps) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmedOverride, setConfirmedOverride] = useState<MessageThread | null>(null);

  const current =
    confirmedOverride && confirmedOverride.id === thread.id ? confirmedOverride : thread;

  useEffect(() => {
    let active = true;

    void (async () => {
      const result = await fetchMessagesForThread(thread.id);
      if (!active) return;
      if (result.error) {
        setError(result.error);
        setMessages([]);
        setLoading(false);
        return;
      }
      setMessages(result.data);
      setError(null);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [thread.id]);

  const latestPayload = useMemo(() => {
    const last = messages[messages.length - 1];
    return last?.payload ?? null;
  }, [messages]);

  const needsMapping = current.mappingStatus !== 'confirmed';

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-heading m-0 text-lg">
            {latestPayload?.businessName || current.subject || 'Thread'}
          </h3>
          <Tag variant={needsMapping ? 'accent' : 'accent-2'}>
            {needsMapping ? 'Needs mapping' : 'Confirmed'}
          </Tag>
        </div>
        <p className="text-ink/65 m-0 mt-1 text-sm">
          {latestPayload?.buyerName || current.buyerName || '—'}
          {latestPayload?.email || current.email
            ? ` · ${latestPayload?.email || current.email}`
            : ''}
        </p>
        {current.prospectName ? (
          <p className="text-ink/55 m-0 mt-1 text-xs">Mapped to {current.prospectName}</p>
        ) : null}
      </div>

      {latestPayload ? <BuyerFields payload={latestPayload} /> : null}

      {loading ? <p className="text-ink/60 m-0 text-sm">Loading messages…</p> : null}
      {error ? (
        <p className="text-accent-800 m-0 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {messages.map((msg) => (
          <article
            key={msg.id}
            className="border-ink/10 bg-surface rounded-md border px-3.5 py-3 text-sm"
          >
            <p className="text-ink/55 m-0 text-[11px] tracking-wide uppercase">
              {msg.kind.replaceAll('_', ' ')} ·{' '}
              {new Date(msg.createdAt).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </p>
            <p className="m-0 mt-1.5 leading-relaxed">{msg.body}</p>
            {msg.payload.lines && msg.payload.lines.length > 0 ? (
              <ul className="border-ink/10 mt-2 list-none border-t pt-2 pl-0">
                {msg.payload.lines.map((line, i) => (
                  <li key={`${line.sku}-${i}`} className="text-ink/75 py-0.5 text-xs">
                    {line.quantity}× {line.sku} — {line.name}
                    {line.size ? ` (${line.size})` : ''} · US${line.wholesaleUsd.toFixed(2)}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>

      {!hideMappingForm && needsMapping ? (
        <ConfirmMappingForm
          thread={current}
          latestPayload={latestPayload}
          onConfirmed={(next) => {
            setConfirmedOverride(next);
            onThreadUpdated?.(next);
          }}
        />
      ) : null}
    </div>
  );
}

function BuyerFields({ payload }: { payload: MessagePayload }) {
  const rows: Array<[string, string]> = [
    ['Phone', payload.phone || '—'],
    [
      'Location',
      [payload.city, payload.province, payload.postalCode].filter(Boolean).join(', ') || '—',
    ],
    ['Channel', payload.retailChannel || '—'],
    ['Existing customer', payload.isExistingCustomer ? 'Yes' : 'No'],
    ['Website', payload.website || '—'],
    ['GST/HST', payload.gstHstNumber || '—'],
    ['PO #', payload.poNumber || '—'],
    ['Preferred contact', payload.preferredContactMethod || '—'],
    ['Notes', payload.notes || '—'],
  ];

  return (
    <dl className="m-0 grid gap-2 text-sm sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">{label}</dt>
          <dd className="m-0 mt-0.5">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
