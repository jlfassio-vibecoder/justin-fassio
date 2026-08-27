// Copilot suggestion ignored: React 19 types export SubmitEvent; FormEvent is deprecated for form onSubmit.
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { CHAT_SILENCE_MS } from '@/lib/chatWittyLines';
import type { ChatState } from '@/lib/liveChat';
import {
  fetchChatMessages,
  openChatSession,
  requestAiChatReply,
  resumeChatSession,
  runChatSilenceCheck,
  sendChatMessage,
} from '@/lib/liveChatClient';
import { supabaseChat } from '@/lib/supabaseChat';
import type { MessageRow } from '@/lib/messages';

type Phase = 'gate' | 'chat';

export function PublicChatFab() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('gate');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [chatState, setChatState] = useState<ChatState>('awaiting_human');
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const silenceTimer = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const justinJoined = chatState === 'human_active';

  useEffect(() => {
    void (async () => {
      const stored = await resumeChatSession();
      if (!stored) return;
      setName(stored.name);
      setEmail(stored.email);
      setThreadId(stored.threadId);
      setPhase('chat');
    })();
  }, []);

  useEffect(() => {
    if (!threadId || !open) return;
    let active = true;
    void (async () => {
      const result = await fetchChatMessages(threadId);
      if (!active) return;
      if (!result.error) setMessages(result.data);
    })();
    return () => {
      active = false;
    };
  }, [threadId, open]);

  useEffect(() => {
    if (!threadId || !open) return;

    const channel = supabaseChat
      .channel(`live-chat-${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${threadId}`,
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
                payload: (row.payload ?? {}) as MessageRow['payload'],
                createdAt: row.created_at,
              },
            ];
          });
          if (row.kind === 'live_chat_staff') {
            setChatState('human_active');
          }
          if (row.kind === 'live_chat_ai') {
            setChatState((prev) => (prev === 'human_active' ? prev : 'ai_active'));
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'message_threads',
          filter: `id=eq.${threadId}`,
        },
        (payload) => {
          const next = (payload.new as { chat_state?: string }).chat_state;
          if (next === 'awaiting_human' || next === 'ai_active' || next === 'human_active') {
            setChatState(next);
          }
        },
      )
      .subscribe();

    return () => {
      void supabaseChat.removeChannel(channel);
    };
  }, [threadId, open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  function clearSilenceTimer() {
    if (silenceTimer.current != null) {
      window.clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
  }

  useEffect(() => {
    if (!open) clearSilenceTimer();
  }, [open]);

  function scheduleSilenceCheck(id: string) {
    clearSilenceTimer();
    silenceTimer.current = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await runChatSilenceCheck(id);
          setChatState(result.chatState);
          // Don't rely only on Realtime — refetch so the witty line always shows.
          const refreshed = await fetchChatMessages(id);
          if (!refreshed.error) {
            setMessages(refreshed.data);
          } else if (result.inserted && result.wittyLine) {
            const wittyLine = result.wittyLine;
            setMessages((prev) => [
              ...prev,
              {
                id: `local-ai-${Date.now()}`,
                threadId: id,
                kind: 'live_chat_ai',
                wholesaleOrderRequestId: null,
                body: wittyLine,
                payload: {},
                createdAt: new Date().toISOString(),
              },
            ]);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not check for a reply');
        }
      })();
    }, CHAT_SILENCE_MS);
  }

  useEffect(() => () => clearSilenceTimer(), []);

  async function handleStart(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const session = await openChatSession(name.trim(), email.trim());
      setThreadId(session.threadId);
      setChatState(session.chatState);
      setPhase('chat');
      const result = await fetchChatMessages(session.threadId);
      if (!result.error) setMessages(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start chat');
    } finally {
      setBusy(false);
    }
  }

  async function handleSend(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!threadId || !draft.trim()) return;
    setError(null);
    setBusy(true);
    const text = draft.trim();
    setDraft('');
    try {
      await sendChatMessage(threadId, text);
      const refreshed = await fetchChatMessages(threadId);
      if (!refreshed.error) setMessages(refreshed.data);
      if (chatState === 'ai_active') {
        await requestAiChatReply(threadId);
        const afterAi = await fetchChatMessages(threadId);
        if (!afterAi.error) setMessages(afterAi.data);
      } else if (chatState !== 'human_active') {
        setChatState('awaiting_human');
        scheduleSilenceCheck(threadId);
      }
    } catch (err) {
      setDraft(text);
      setError(err instanceof Error ? err.message : 'Could not send');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      {open ? (
        <section
          className="border-ink/15 bg-surface pointer-events-auto flex h-[min(32rem,70vh)] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border shadow-xl"
          aria-label="Chat with Justin"
        >
          <header className="border-ink/10 bg-accent-700 text-on-accent flex items-start justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <p className="font-heading m-0 text-base leading-tight">Chat with Justin</p>
              <p className="m-0 mt-0.5 text-[11px] leading-snug opacity-90">
                {justinJoined
                  ? 'Justin joined — you’re talking to a real person.'
                  : 'You’re talking to Justin — a real person.'}
              </p>
            </div>
            <button
              type="button"
              className="text-on-accent/90 hover:text-on-accent mt-0.5 inline-flex rounded-full p-1"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
            >
              <X size={18} strokeWidth={2.75} />
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col">
            {phase === 'gate' ? (
              <form className="flex flex-col gap-3 p-4" onSubmit={(e) => void handleStart(e)}>
                <p className="text-ink/70 m-0 text-sm">
                  Drop your name so Justin knows who he’s talking to. Email is optional.
                </p>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Name *</span>
                  <input
                    required
                    className="border-ink/15 rounded-lg border px-3 py-2 text-sm outline-none"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Email (optional)</span>
                  <input
                    type="email"
                    className="border-ink/15 rounded-lg border px-3 py-2 text-sm outline-none"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </label>
                {error ? (
                  <p className="text-accent-800 m-0 text-xs" role="alert">
                    {error}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={busy}
                  className="bg-accent-700 font-heading text-on-accent hover:bg-accent-600 rounded-full px-4 py-2 text-sm disabled:opacity-40"
                >
                  {busy ? 'Starting…' : 'Start chat'}
                </button>
              </form>
            ) : (
              <>
                <div
                  ref={listRef}
                  className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3"
                >
                  {messages.map((msg) => {
                    const mine = msg.kind === 'live_chat_visitor';
                    const system = msg.kind === 'live_chat_system';
                    return (
                      <div
                        key={msg.id}
                        className={
                          system
                            ? 'text-ink/55 text-center text-[11px]'
                            : mine
                              ? 'bg-accent-700 text-on-accent ml-8 rounded-2xl rounded-br-md px-3 py-2 text-sm'
                              : 'bg-ink/5 text-ink mr-8 rounded-2xl rounded-bl-md px-3 py-2 text-sm'
                        }
                      >
                        {!system && !mine ? (
                          <p className="text-ink/50 m-0 mb-0.5 text-[10px] tracking-wide uppercase">
                            {msg.kind === 'live_chat_staff' ? 'Justin' : 'Assistant'}
                          </p>
                        ) : null}
                        <p className="m-0 whitespace-pre-wrap">{msg.body}</p>
                      </div>
                    );
                  })}
                </div>
                {error ? (
                  <p className="text-accent-800 m-0 px-3 text-xs" role="alert">
                    {error}
                  </p>
                ) : null}
                <form
                  className="border-ink/10 flex gap-2 border-t p-3"
                  onSubmit={(e) => void handleSend(e)}
                >
                  <input
                    className="border-ink/15 min-w-0 flex-1 rounded-full border px-3 py-2 text-sm outline-none"
                    placeholder="Say hello…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={busy}
                    maxLength={4000}
                  />
                  <button
                    type="submit"
                    disabled={busy || !draft.trim()}
                    className="bg-accent-700 font-heading text-on-accent hover:bg-accent-600 rounded-full px-3.5 py-2 text-sm disabled:opacity-40"
                  >
                    Send
                  </button>
                </form>
              </>
            )}
          </div>
        </section>
      ) : null}

      <button
        type="button"
        className="bg-accent-700 font-heading text-on-accent hover:bg-accent-600 pointer-events-auto inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm shadow-lg"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Close chat' : 'Chat with Justin'}
      >
        <MessageCircle size={18} strokeWidth={2.75} />
        <span>{open ? 'Close' : 'Chat with Justin'}</span>
      </button>
    </div>
  );
}
