import { useEffect, useState, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/Button';
import {
  fetchBuyerMessageThreads,
  fetchMessagesForThread,
  sendBuyerThreadReply,
} from '@/lib/buyerMessages';
import type { MessageRow, MessageThread } from '@/lib/messages';

type Props = {
  prospectId: number;
};

export function BuyerMessagesSection({ prospectId }: Props) {
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selected, setSelected] = useState<MessageThread | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await fetchBuyerMessageThreads(prospectId);
      if (!active) return;
      if (result.error) {
        setError(result.error);
        setThreads([]);
        setLoading(false);
        return;
      }
      setThreads(result.data);
      setError(null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [prospectId]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    void (async () => {
      const result = await fetchMessagesForThread(selected.id);
      if (!active) return;
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessages(result.data);
    })();
    return () => {
      active = false;
    };
  }, [selected]);

  function selectThread(thread: MessageThread) {
    setSelected(thread);
    setMessages([]);
  }
  async function handleReply(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || !reply.trim()) return;
    setReplyBusy(true);
    const result = await sendBuyerThreadReply(selected.id, reply);
    setReplyBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessages((prev) => [...prev, result.message]);
    setReply('');
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading m-0 text-xl">Messages</h2>
      {loading ? <p className="text-ink/60 m-0 text-sm">Loading messages…</p> : null}
      {error ? (
        <p className="text-accent-800 m-0 text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && threads.length === 0 ? (
        <p className="text-ink/60 m-0 text-sm">
          No threads yet. Submit a wholesale request or inquiry to start a conversation.
        </p>
      ) : null}
      {threads.length > 0 ? (
        <div className="gap-4.1 grid md:grid-cols-[240px_1fr]">
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {threads.map((thread) => (
              <li key={thread.id}>
                <button
                  type="button"
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                    selected?.id === thread.id ? 'bg-accent-100 text-accent-900' : 'hover:bg-ink/5'
                  }`}
                  onClick={() => selectThread(thread)}
                >
                  <span className="font-heading block truncate">
                    {thread.subject || thread.requestNumber || 'Conversation'}
                  </span>
                  <span className="text-ink/55 block truncate text-xs capitalize">
                    {thread.channel.replace('_', ' ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-divider min-h-[220px] rounded-xl border p-3">
            {!selected ? (
              <p className="text-ink/55 m-0 text-sm">Select a thread to read and reply.</p>
            ) : (
              <>
                <ul className="mb-3 flex max-h-[320px] list-none flex-col gap-2 overflow-y-auto p-0">
                  {messages.map((msg) => (
                    <li
                      key={msg.id}
                      className={`rounded-lg px-3 py-2 text-sm ${
                        msg.kind === 'buyer_reply' ? 'bg-accent-100 ml-6' : 'bg-surface mr-6'
                      }`}
                    >
                      <p className="text-ink/50 m-0 mb-1 text-[11px] tracking-wide uppercase">
                        {msg.kind === 'buyer_reply' ? 'You' : 'Justin / team'}
                      </p>
                      <p className="m-0 whitespace-pre-wrap">{msg.body}</p>
                    </li>
                  ))}
                </ul>
                <form onSubmit={handleReply} className="flex flex-col gap-2">
                  <label className="text-ink/70 text-xs font-semibold">
                    Reply
                    <textarea
                      className="border-divider focus:border-accent-700 mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                      rows={3}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      disabled={replyBusy}
                    />
                  </label>
                  <Button type="submit" variant="primary" disabled={replyBusy || !reply.trim()}>
                    {replyBusy ? 'Sending…' : 'Send reply'}
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
