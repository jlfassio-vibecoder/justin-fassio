import { cn } from '@/lib/cn';
import type { GmailLabelFilter, GmailThreadSummary } from '@/lib/google/gmailTypes';

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const LABELS: { key: GmailLabelFilter; label: string }[] = [
  { key: 'INBOX', label: 'Inbox' },
  { key: 'SENT', label: 'Sent' },
  { key: 'DRAFT', label: 'Drafts' },
];

export type GmailThreadListProps = {
  threads: GmailThreadSummary[];
  selectedId: string | null;
  label: GmailLabelFilter;
  search: string;
  loading: boolean;
  emptyMessage?: string;
  hasMore: boolean;
  onSelect: (thread: GmailThreadSummary) => void;
  onLabelChange: (label: GmailLabelFilter) => void;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  onRefresh: () => void;
  onLoadMore: () => void;
};

export function GmailThreadList({
  threads,
  selectedId,
  label,
  search,
  loading,
  emptyMessage = 'No Gmail threads.',
  hasMore,
  onSelect,
  onLabelChange,
  onSearchChange,
  onSearchSubmit,
  onRefresh,
  onLoadMore,
}: GmailThreadListProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-surface flex flex-wrap items-center gap-1 rounded-full p-1">
        {LABELS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => onLabelChange(f.key)}
            className={cn(
              'font-heading rounded-full px-3 py-1.5 text-sm',
              label === f.key ? 'bg-accent text-bg' : 'text-ink/70 bg-transparent',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSearchSubmit();
        }}
      >
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search Gmail…"
          className="border-ink/15 bg-bg text-ink min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="font-heading border-ink/15 text-ink rounded-md border px-3 py-2 text-sm"
        >
          Search
        </button>
        <button
          type="button"
          onClick={onRefresh}
          className="font-heading border-ink/15 text-ink rounded-md border px-3 py-2 text-sm"
        >
          Refresh
        </button>
      </form>

      {loading && threads.length === 0 ? (
        <p className="text-ink/60 m-0 text-sm">Loading Gmail…</p>
      ) : null}

      {!loading && threads.length === 0 ? (
        <p className="text-ink/60 m-0 text-sm">{emptyMessage}</p>
      ) : null}

      {threads.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {threads.map((thread) => {
            const selected = thread.id === selectedId;
            return (
              <li key={thread.id}>
                <button
                  type="button"
                  onClick={() => onSelect(thread)}
                  className={cn(
                    'w-full rounded-md border px-3 py-2.5 text-left transition-colors',
                    selected
                      ? 'border-accent/40 bg-accent/10'
                      : 'border-ink/10 bg-surface hover:bg-ink/[0.04]',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={cn(
                        'font-heading m-0 truncate text-sm',
                        thread.unread ? 'text-ink' : 'text-ink/80',
                      )}
                    >
                      {thread.unread ? '• ' : ''}
                      {thread.subject}
                    </p>
                    <span className="text-ink/50 shrink-0 text-xs">{formatWhen(thread.date)}</span>
                  </div>
                  <p className="text-ink/60 m-0 mt-1 truncate text-xs">
                    {thread.from || thread.to}
                  </p>
                  {thread.snippet ? (
                    <p className="text-ink/50 m-0 mt-1 line-clamp-2 text-xs">{thread.snippet}</p>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {hasMore ? (
        <button
          type="button"
          disabled={loading}
          onClick={onLoadMore}
          className="font-heading border-ink/15 text-ink rounded-md border px-3 py-2 text-sm disabled:opacity-45"
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </div>
  );
}
