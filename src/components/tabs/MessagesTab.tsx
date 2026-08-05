import { useEffect, useState } from 'react';
import { MessageThreadPanel } from '@/components/messages/MessageThreadPanel';
import { MessagesThreadList } from '@/components/messages/MessagesThreadList';
import { cn } from '@/lib/cn';
import {
  fetchMessageThreads,
  fetchNeedsMappingCount,
  type MessageThread,
  type MessageThreadFilter,
} from '@/lib/messages';

const FILTERS: { key: MessageThreadFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'needs_mapping', label: 'Needs mapping' },
  { key: 'confirmed', label: 'Confirmed' },
];

interface MessagesTabProps {
  reloadToken?: number;
  onNeedsMappingCountChange?: (count: number) => void;
}

export function MessagesTab({ reloadToken = 0, onNeedsMappingCountChange }: MessagesTabProps) {
  const [filter, setFilter] = useState<MessageThreadFilter>('all');
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selected, setSelected] = useState<MessageThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listReloadToken, setListReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    void (async () => {
      const result = await fetchMessageThreads({ filter });
      if (!active) return;
      if (result.error) {
        setThreads([]);
        setError(result.error);
        setLoading(false);
        return;
      }
      setThreads(result.data);
      setError(null);
      setLoading(false);
      setSelected((prev) => {
        if (!prev) return result.data[0] ?? null;
        return result.data.find((t) => t.id === prev.id) ?? result.data[0] ?? null;
      });

      if (onNeedsMappingCountChange) {
        const badge = await fetchNeedsMappingCount();
        if (!active) return;
        onNeedsMappingCountChange(badge.count);
      }
    })();

    return () => {
      active = false;
    };
  }, [filter, reloadToken, listReloadToken, onNeedsMappingCountChange]);

  return (
    <section data-screen-label="messages" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading m-0 text-2xl">Messages</h2>
          <p className="text-ink/65 m-0 mt-1 text-sm">
            Inbound wholesale order requests. Confirm the account map so threads show on prospect
            and account drawers.
          </p>
        </div>
        <div className="bg-surface flex items-center gap-1 rounded-full p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => {
                setLoading(true);
                setFilter(f.key);
              }}
              className={cn(
                'font-heading rounded-full px-3.5 py-1.5 text-sm',
                filter === f.key ? 'bg-accent text-bg' : 'text-ink/70 bg-transparent',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <p className="text-ink/60 m-0 text-sm">Loading threads…</p> : null}
      {error ? (
        <p className="text-accent-800 m-0 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !error ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <MessagesThreadList
            threads={threads}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            emptyMessage={
              filter === 'needs_mapping'
                ? 'No threads need mapping.'
                : filter === 'confirmed'
                  ? 'No confirmed threads yet.'
                  : 'No wholesale messages yet. New order requests appear here.'
            }
          />
          <div className="border-ink/10 bg-surface min-h-[20rem] rounded-md border p-4">
            {selected ? (
              <MessageThreadPanel
                key={selected.id}
                thread={selected}
                onThreadUpdated={() => {
                  setLoading(true);
                  setListReloadToken((n) => n + 1);
                }}
              />
            ) : (
              <p className="text-ink/60 m-0 text-sm">Select a thread to view details.</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
