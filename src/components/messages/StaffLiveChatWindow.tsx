// Copilot suggestion ignored: React 19 types export SubmitEvent; FormEvent is deprecated for form onSubmit.
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { Minus, X } from 'lucide-react';
import { Tag } from '@/components/ui/Tag';
import { sendStaffChatReply } from '@/lib/liveChatClient';
import {
  fetchMessagesForThread,
  type ChatState,
  type MessagePayload,
  type MessageRow,
  type MessageThread,
} from '@/lib/messages';
import { supabase } from '@/lib/supabase';

function chatStateLabel(state: ChatState | null): string {
  if (state === 'human_active') return 'You joined';
  if (state === 'ai_active') return 'AI covering';
  return 'Awaiting you';
}

interface StaffLiveChatWindowProps {
  thread: MessageThread;
  minimized: boolean;
  unread: number;
  onMinimize: () => void;
  onExpand: () => void;
  onClose: () => void;
  onVisitorMessageWhileMinimized: () => void;
  onReplySent: (thread: MessageThread) => void;
}

export function StaffLiveChatWindow({
  thread,
  minimized,
  unread,
  onMinimize,
  onExpand,
  onClose,
  onVisitorMessageWhileMinimized,
  onReplySent,
}: StaffLiveChatWindowProps) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [chatState, setChatState] = useState<ChatState | null>(thread.chatState);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const minimizedRef = useRef(minimized);
  const onVisitorMsgRef = useRef(onVisitorMessageWhileMinimized);

  useEffect(() => {
    minimizedRef.current = minimized;
  }, [minimized]);

  useEffect(() => {
    onVisitorMsgRef.current = onVisitorMessageWhileMinimized;
  }, [onVisitorMessageWhileMinimized]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await fetchMessagesForThread(thread.id);
      if (!active) return;
      if (!result.error) setMessages(result.data);
    })();
    return () => {
      active = false;
    };
  }, [thread.id]);

  useEffect(() => {
    const channel = supabase
      .channel(`staff-float-chat-${thread.id}`)
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
          if (row.kind === 'live_chat_visitor' && minimizedRef.current) {
            onVisitorMsgRef.current();
          }
          if (row.kind === 'live_chat_staff') {
            setChatState('human_active');
          }
          if (row.kind === 'live_chat_ai') {
            setChatState((prev) => (prev === 'human_active' ? prev : 'ai_active'));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [thread.id]);

  useEffect(() => {
    if (minimized) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, minimized]);

  const title = thread.visitorName || thread.buyerName || thread.subject || 'Live chat';
  const subtitle = thread.visitorEmail || thread.email || null;

  async function handleReply(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setError(null);
    const text = reply.trim();
    setReply('');
    try {
      await sendStaffChatReply(thread.id, text);
      setChatState('human_active');
      onReplySent({
        ...thread,
        chatState: 'human_active',
        lastMessageAt: new Date().toISOString(),
      });
      const refreshed = await fetchMessagesForThread(thread.id);
      if (!refreshed.error) setMessages(refreshed.data);
    } catch (err) {
      setReply(text);
      setError(err instanceof Error ? err.message : 'Could not send reply');
    } finally {
      setBusy(false);
    }
  }

  if (minimized) {
    return (
      <button
        type="button"
        className="bg-accent-700 font-heading text-bg hover:bg-accent-600 pointer-events-auto relative inline-flex max-w-[14rem] items-center gap-2 rounded-full px-4 py-3 text-sm shadow-lg"
        onClick={onExpand}
        aria-label={`Expand chat with ${title}`}
      >
        <span className="truncate">{title}</span>
        {unread > 0 ? (
          <span className="bg-surface text-accent-800 absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold shadow">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <section
      className="border-ink/15 bg-surface pointer-events-auto flex h-[min(28rem,70vh)] w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border shadow-xl"
      aria-label={`Live chat with ${title}`}
    >
      <header className="border-ink/10 bg-accent-700 text-bg flex items-start justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <p className="font-heading m-0 truncate text-sm leading-tight">{title}</p>
          {subtitle ? (
            <p className="m-0 mt-0.5 truncate text-[11px] opacity-90">{subtitle}</p>
          ) : null}
          <div className="mt-1.5">
            <Tag variant={chatState === 'human_active' ? 'accent-2' : 'accent'}>
              {chatStateLabel(chatState)}
            </Tag>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            className="text-bg/90 hover:text-bg inline-flex rounded-full p-1"
            aria-label="Minimize chat"
            onClick={onMinimize}
          >
            <Minus size={16} strokeWidth={2.75} />
          </button>
          <button
            type="button"
            className="text-bg/90 hover:text-bg inline-flex rounded-full p-1"
            aria-label="Close chat"
            onClick={onClose}
          >
            <X size={16} strokeWidth={2.75} />
          </button>
        </div>
      </header>

      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
        {messages.map((msg) => {
          const mine = msg.kind === 'live_chat_staff';
          const system = msg.kind === 'live_chat_system';
          return (
            <div
              key={msg.id}
              className={
                system
                  ? 'text-ink/55 text-center text-[11px]'
                  : mine
                    ? 'bg-accent-700 text-bg ml-6 rounded-2xl rounded-br-md px-3 py-2 text-sm'
                    : 'bg-ink/5 text-ink mr-6 rounded-2xl rounded-bl-md px-3 py-2 text-sm'
              }
            >
              {!system && !mine ? (
                <p className="text-ink/50 m-0 mb-0.5 text-[10px] tracking-wide uppercase">
                  {msg.kind === 'live_chat_ai' ? 'Assistant' : 'Visitor'}
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
        className="border-ink/10 flex gap-2 border-t p-2.5"
        onSubmit={(e) => void handleReply(e)}
      >
        <input
          className="border-ink/15 min-w-0 flex-1 rounded-full border px-3 py-2 text-sm outline-none"
          placeholder="Reply as Justin…"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          disabled={busy}
          maxLength={4000}
        />
        <button
          type="submit"
          disabled={busy || !reply.trim()}
          className="bg-accent-700 font-heading text-bg hover:bg-accent-600 rounded-full px-3 py-2 text-sm disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </section>
  );
}
