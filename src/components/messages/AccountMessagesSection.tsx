import { useEffect, useState } from 'react';
import { MessageThreadPanel } from '@/components/messages/MessageThreadPanel';
import { MessagesThreadList } from '@/components/messages/MessagesThreadList';
import { fetchMessageThreads, type MessageThread } from '@/lib/messages';

interface AccountMessagesSectionProps {
  prospectId: number;
}

export function AccountMessagesSection({ prospectId }: AccountMessagesSectionProps) {
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selected, setSelected] = useState<MessageThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      const result = await fetchMessageThreads({ prospectId, filter: 'all' });
      if (!active) return;
      if (result.error) {
        setThreads([]);
        setSelected(null);
        setError(result.error);
        setLoading(false);
        return;
      }
      setThreads(result.data);
      setSelected(null);
      setError(null);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [prospectId]);

  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="font-heading m-0 text-sm tracking-wide uppercase">Messages</h3>
      {loading ? <p className="text-ink/60 m-0 text-xs">Loading messages…</p> : null}
      {error ? (
        <p className="text-accent-800 m-0 text-xs" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && !error && threads.length === 0 ? (
        <p className="text-ink/60 m-0 text-xs">No confirmed message threads for this account.</p>
      ) : null}
      {!loading && !error && threads.length > 0 ? (
        <>
          <MessagesThreadList
            threads={threads}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
          />
          {selected ? (
            <div className="border-ink/10 mt-1 rounded-md border p-3">
              <MessageThreadPanel key={selected.id} thread={selected} hideMappingForm />
            </div>
          ) : (
            <p className="text-ink/55 m-0 text-xs">Select a thread to open.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
