import { Button } from '@/components/ui/Button';
import type { GmailMessageView, GmailThreadDetail } from '@/lib/google/gmailTypes';
import { downloadGmailAttachmentClient } from '@/lib/gmailClientBrowser';

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export type GmailThreadPanelProps = {
  thread: GmailThreadDetail | null;
  loading: boolean;
  error: string | null;
  canCompose?: boolean;
  onReply?: (mode: 'reply' | 'reply_all', message: GmailMessageView) => void;
};

export function GmailThreadPanel({
  thread,
  loading,
  error,
  canCompose = false,
  onReply,
}: GmailThreadPanelProps) {
  if (loading && !thread) {
    return <p className="text-ink/60 m-0 text-sm">Loading thread…</p>;
  }
  if (error) {
    return (
      <p className="text-accent-800 m-0 text-sm" role="alert">
        {error}
      </p>
    );
  }
  if (!thread) {
    return <p className="text-ink/60 m-0 text-sm">Select a Gmail thread to read.</p>;
  }

  const latest = thread.messages[thread.messages.length - 1] ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading m-0 text-lg">{thread.subject}</h3>
          <p className="text-ink/55 m-0 mt-1 text-xs">
            {thread.messages.length} message{thread.messages.length === 1 ? '' : 's'}
            {thread.unread ? ' · unread' : ''}
          </p>
        </div>
        {canCompose && latest && onReply ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => onReply('reply', latest)}>
              Reply
            </Button>
            <Button type="button" variant="secondary" onClick={() => onReply('reply_all', latest)}>
              Reply all
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        {thread.messages.map((message) => (
          <article key={message.id} className="border-ink/10 bg-bg rounded-md border px-3 py-3">
            <header className="mb-2 flex flex-col gap-0.5">
              <p className="text-ink m-0 text-sm">
                <span className="text-ink/55">From </span>
                {message.from || '—'}
              </p>
              <p className="text-ink/70 m-0 text-xs">
                To {message.to || '—'}
                {message.cc ? ` · Cc ${message.cc}` : ''}
              </p>
              <p className="text-ink/50 m-0 text-xs">{formatWhen(message.date)}</p>
            </header>
            {message.bodyText ? (
              <pre className="text-ink m-0 font-sans text-sm leading-relaxed whitespace-pre-wrap">
                {message.bodyText}
              </pre>
            ) : message.bodyHtml ? (
              <p className="text-ink/70 m-0 text-sm">
                This message has HTML content only. Plain-text body was not available.
              </p>
            ) : (
              <p className="text-ink/50 m-0 text-sm">No message body.</p>
            )}
            {message.attachments.length > 0 ? (
              <ul className="text-ink/60 m-0 mt-3 list-none p-0 text-xs">
                {message.attachments.map((a) => {
                  const attachmentId = a.attachmentId;
                  return (
                    <li
                      key={`${message.id}-${a.filename}-${attachmentId ?? 'x'}`}
                      className="mt-1 flex flex-wrap items-center gap-2"
                    >
                      <span>
                        {a.filename}
                        {a.size > 0 ? ` (${a.size} bytes)` : ''}
                      </span>
                      {attachmentId ? (
                        <button
                          type="button"
                          className="text-accent font-heading underline"
                          onClick={() => {
                            void downloadGmailAttachmentClient({
                              messageId: message.id,
                              attachmentId,
                              filename: a.filename,
                            });
                          }}
                        >
                          Download
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
