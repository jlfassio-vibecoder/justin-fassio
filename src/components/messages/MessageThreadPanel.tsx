// Copilot suggestion ignored: React 19 types export SubmitEvent; FormEvent is deprecated for form onSubmit.
import { useEffect, useMemo, useState, type SubmitEvent } from 'react';
import { AddProspectAiModal } from '@/components/AddProspectAiModal';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { sendStaffChatReply } from '@/lib/liveChatClient';
import type { MessagePayload, MessageRow, MessageThread } from '@/lib/messages';
import {
  confirmThreadMapping,
  fetchMessagesForThread,
  fetchProspectById,
  fingerprintFromPayload,
  searchProspectsForMapping,
} from '@/lib/messages';
import type { Prospect } from '@/lib/prospects';
import { supabase } from '@/lib/supabase';

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
  const [suggested, setSuggested] = useState<Prospect | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addAiOpen, setAddAiOpen] = useState(false);

  const trimmedQuery = query.trim();
  const visibleHits = trimmedQuery.length >= 2 ? hits : [];

  useEffect(() => {
    const suggestedId = thread.prospectId;
    if (suggestedId == null || thread.mappingStatus === 'confirmed') return;

    let active = true;
    void (async () => {
      const result = await fetchProspectById(suggestedId);
      if (!active || result.error || !result.data) return;
      setSuggested(result.data);
      setSelected(result.data);
    })();

    return () => {
      active = false;
    };
  }, [thread.prospectId, thread.mappingStatus]);

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
        if (thread.prospectId != null) {
          const match = result.data.find((p) => p.id === thread.prospectId);
          if (match) setSelected(match);
        }
      })();
    }, 220);

    const busyTimer = window.setTimeout(() => {
      if (active) setSearchBusy(true);
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
      window.clearTimeout(busyTimer);
    };
  }, [trimmedQuery, thread.prospectId]);

  async function confirmWithProspect(prospect: Prospect) {
    const fingerprint =
      thread.identityFingerprint || fingerprintFromPayload(latestPayload ?? {}) || null;
    if (!fingerprint) {
      setError('Missing buyer identity on this thread.');
      return;
    }

    setBusy(true);
    setError(null);
    const result = await confirmThreadMapping({
      threadId: thread.id,
      prospectId: prospect.id,
      confirmedFingerprint: fingerprint,
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onConfirmed({
      ...thread,
      prospectId: prospect.id,
      mappingStatus: 'confirmed',
      confirmedFingerprint: fingerprint,
      prospectName: prospect.name,
    });
  }

  async function handleConfirm() {
    if (!selected) {
      setError('Select a prospect or active account first.');
      return;
    }
    await confirmWithProspect(selected);
  }

  return (
    <div className="border-ink/10 bg-bg flex flex-col gap-2.5 rounded-md border p-3">
      <p className="font-heading m-0 text-sm">Confirm account mapping</p>
      <p className="text-ink/65 m-0 text-xs">
        Link this thread to a prospect or active account. Mapping is required before the thread
        appears on their detail drawer. Prefer an existing match when one is suggested; only use Add
        via AI when there is no destination.
      </p>

      {suggested ? (
        <div className="border-ink/10 bg-surface rounded-md border px-3 py-2 text-xs">
          <p className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">Suggested match</p>
          <p className="m-0 mt-0.5 font-semibold">
            {suggested.name}{' '}
            <span className="text-ink/60 font-normal">
              · {suggested.city} ·{' '}
              {suggested.accountStatus === 'active_account' ? 'Account' : 'Prospect'}
            </span>
          </p>
          <Button
            variant="secondary"
            className="mt-2 px-3 py-1 text-xs"
            disabled={busy}
            onClick={() => {
              setSelected(suggested);
              void confirmWithProspect(suggested);
            }}
          >
            Confirm suggested
          </Button>
        </div>
      ) : null}

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
            const isSuggested = suggested?.id === hit.id;
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
                    {isSuggested ? ' · suggested' : ''}
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
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy || !selected} onClick={() => void handleConfirm()}>
          {busy ? 'Saving…' : 'Confirm mapping'}
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setError(null);
            setAddAiOpen(true);
          }}
        >
          Add via AI from this message
        </Button>
      </div>

      <AddProspectAiModal
        key={addAiOpen ? `open-${thread.id}` : 'closed'}
        open={addAiOpen}
        onClose={() => setAddAiOpen(false)}
        initialValues={{
          companyName: latestPayload?.businessName || thread.businessName || undefined,
          websiteUrl: latestPayload?.website || undefined,
        }}
        enrichSeeds={{
          contactName: latestPayload?.buyerName || undefined,
          phone: latestPayload?.phone || undefined,
          email: latestPayload?.email || undefined,
          city: latestPayload?.city || undefined,
          retailChannelHint: latestPayload?.retailChannel || undefined,
        }}
        onCreated={(prospect) => {
          void confirmWithProspect(prospect);
        }}
      />
    </div>
  );
}

interface MessageThreadPanelProps {
  thread: MessageThread;
  onThreadUpdated?: (thread: MessageThread) => void;
  onOpenMapped?: (thread: MessageThread) => void;
  onOpenLiveChat?: (thread: MessageThread) => void;
  /** When true, hide mapping form (e.g. already scoped inside a mapped drawer). */
  hideMappingForm?: boolean;
}

export function MessageThreadPanel({
  thread,
  onThreadUpdated,
  onOpenMapped,
  onOpenLiveChat,
  hideMappingForm = false,
}: MessageThreadPanelProps) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmedOverride, setConfirmedOverride] = useState<MessageThread | null>(null);
  const [reply, setReply] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const current =
    confirmedOverride && confirmedOverride.id === thread.id ? confirmedOverride : thread;
  const isLiveChat = current.channel === 'live_chat';

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

  useEffect(() => {
    if (!isLiveChat) return;

    const channel = supabase
      .channel(`staff-live-chat-${thread.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${thread.id}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            thread_id: string;
            kind: string;
            wholesale_order_request_id: string | null;
            body: string;
            payload: unknown;
            created_at: string;
          };
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [
              ...prev,
              {
                id: row.id,
                threadId: row.thread_id,
                kind: row.kind,
                wholesaleOrderRequestId: row.wholesale_order_request_id,
                body: row.body,
                payload: (row.payload ?? {}) as MessagePayload,
                createdAt: row.created_at,
              },
            ];
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [thread.id, isLiveChat]);

  const latestPayload = useMemo(() => {
    if (isLiveChat) {
      return {
        businessName: current.visitorName ?? undefined,
        buyerName: current.visitorName ?? undefined,
        email: current.visitorEmail ?? undefined,
      } satisfies MessagePayload;
    }
    const last = [...messages].reverse().find((m) => m.payload && Object.keys(m.payload).length);
    return last?.payload ?? null;
  }, [messages, isLiveChat, current.visitorName, current.visitorEmail]);

  const needsMapping = current.mappingStatus !== 'confirmed';

  async function handleStaffReply(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reply.trim()) return;
    setReplyBusy(true);
    setReplyError(null);
    try {
      await sendStaffChatReply(thread.id, reply.trim());
      setReply('');
      onThreadUpdated?.({
        ...current,
        chatState: 'human_active',
        lastMessageAt: new Date().toISOString(),
      });
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Could not send reply');
    } finally {
      setReplyBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-heading m-0 text-lg">
            {latestPayload?.businessName || current.subject || 'Thread'}
          </h3>
          {isLiveChat ? <Tag variant="neutral">Live chat</Tag> : null}
          {isLiveChat && current.chatState ? (
            <Tag variant={current.chatState === 'human_active' ? 'accent-2' : 'accent'}>
              {current.chatState === 'human_active'
                ? 'You joined'
                : current.chatState === 'ai_active'
                  ? 'AI covering'
                  : 'Awaiting you'}
            </Tag>
          ) : null}
          <Tag variant={needsMapping ? 'accent' : 'accent-2'}>
            {needsMapping ? 'Needs mapping' : 'Confirmed'}
          </Tag>
          {isLiveChat && onOpenLiveChat ? (
            <Button type="button" variant="secondary" onClick={() => onOpenLiveChat(current)}>
              Open chat
            </Button>
          ) : null}
        </div>
        <p className="text-ink/65 m-0 mt-1 text-sm">
          {latestPayload?.buyerName || current.buyerName || '—'}
          {latestPayload?.email || current.email
            ? ` · ${latestPayload?.email || current.email}`
            : ''}
        </p>
        {current.prospectName ? (
          current.prospectId != null && onOpenMapped ? (
            <p className="text-ink/55 m-0 mt-1 text-xs">
              Mapped to{' '}
              <button
                type="button"
                className="text-accent m-0 cursor-pointer border-0 bg-transparent p-0 underline-offset-2 hover:underline"
                onClick={() => onOpenMapped(current)}
              >
                {current.prospectName}
              </button>
            </p>
          ) : (
            <p className="text-ink/55 m-0 mt-1 text-xs">Mapped to {current.prospectName}</p>
          )
        ) : null}
      </div>

      {!isLiveChat && latestPayload ? <BuyerFields payload={latestPayload} /> : null}

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

      {isLiveChat ? (
        <form className="flex flex-col gap-2" onSubmit={(e) => void handleStaffReply(e)}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-heading text-sm">Reply as Justin</span>
            <textarea
              className="border-ink/15 min-h-[88px] rounded-md border px-3 py-2 text-sm outline-none"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Take over the chat…"
              maxLength={4000}
              disabled={replyBusy}
            />
          </label>
          {replyError ? (
            <p className="text-accent-800 m-0 text-xs" role="alert">
              {replyError}
            </p>
          ) : null}
          <div>
            <Button type="submit" variant="primary" disabled={replyBusy || !reply.trim()}>
              {replyBusy ? 'Sending…' : 'Send reply'}
            </Button>
          </div>
        </form>
      ) : null}

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
