import type { GmailThreadDetail } from '@/lib/google/gmailTypes';

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
};

export function GmailThreadPanel({ thread, loading, error }: GmailThreadPanelProps) {
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

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-heading m-0 text-lg">{thread.subject}</h3>
        <p className="text-ink/55 m-0 mt-1 text-xs">
          {thread.messages.length} message{thread.messages.length === 1 ? '' : 's'}
          {thread.unread ? ' · unread' : ''}
        </p>
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
              <ul className="text-ink/60 m-0 mt-3 list-disc pl-5 text-xs">
                {message.attachments.map((a) => (
                  <li key={`${message.id}-${a.filename}`}>
                    {a.filename}
                    {a.size > 0 ? ` (${a.size} bytes)` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
