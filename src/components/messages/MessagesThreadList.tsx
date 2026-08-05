import { Tag } from '@/components/ui/Tag';
import { cn } from '@/lib/cn';
import type { MessageThread, MappingStatus } from '@/lib/messages';

function statusLabel(status: MappingStatus): string {
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'suggested') return 'Needs mapping';
  return 'Unmapped';
}

function statusVariant(status: MappingStatus): 'accent' | 'accent-2' | 'neutral' | 'outline' {
  if (status === 'confirmed') return 'accent-2';
  if (status === 'suggested') return 'accent';
  return 'outline';
}

function formatWhen(iso: string): string {
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

interface MessagesThreadListProps {
  threads: MessageThread[];
  selectedId: string | null;
  onSelect: (thread: MessageThread) => void;
  onOpenMapped?: (thread: MessageThread) => void;
  emptyMessage?: string;
}

export function MessagesThreadList({
  threads,
  selectedId,
  onSelect,
  onOpenMapped,
  emptyMessage = 'No messages yet.',
}: MessagesThreadListProps) {
  if (threads.length === 0) {
    return <p className="text-ink/60 m-0 text-sm">{emptyMessage}</p>;
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {threads.map((thread) => {
        const selected = thread.id === selectedId;
        const title = thread.businessName || thread.subject || 'Wholesale request';
        const canOpenMapped = thread.prospectId != null && onOpenMapped != null;

        return (
          <li key={thread.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelect(thread)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(thread);
                }
              }}
              className={cn(
                'w-full cursor-pointer rounded-md border px-3.5 py-3 text-left transition-colors',
                selected
                  ? 'border-accent bg-accent/10'
                  : 'border-ink/10 bg-surface hover:border-ink/25',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  {canOpenMapped ? (
                    <button
                      type="button"
                      className="font-heading text-accent m-0 cursor-pointer border-0 bg-transparent p-0 text-left text-sm leading-snug underline-offset-2 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(thread);
                        onOpenMapped(thread);
                      }}
                    >
                      {title}
                    </button>
                  ) : (
                    <p className="font-heading m-0 text-sm leading-snug">{title}</p>
                  )}
                  <p className="text-ink/65 m-0 mt-0.5 text-xs">
                    {thread.buyerName || '—'}
                    {thread.email ? ` · ${thread.email}` : ''}
                  </p>
                </div>
                <Tag variant={statusVariant(thread.mappingStatus)}>
                  {statusLabel(thread.mappingStatus)}
                </Tag>
              </div>
              <div className="text-ink/55 mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                {thread.requestNumber ? <span>{thread.requestNumber}</span> : null}
                <span>{formatWhen(thread.lastMessageAt)}</span>
                {thread.prospectName ? (
                  canOpenMapped ? (
                    <button
                      type="button"
                      className="text-accent m-0 cursor-pointer border-0 bg-transparent p-0 underline-offset-2 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(thread);
                        onOpenMapped(thread);
                      }}
                    >
                      → {thread.prospectName}
                    </button>
                  ) : (
                    <span>→ {thread.prospectName}</span>
                  )
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
