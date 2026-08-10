import { useEffect, useState } from 'react';
import type { GmailThreadLinkPublic } from '@/lib/google/gmailThreadLinks';
import { listGmailLinksForProspectClient } from '@/lib/gmailClientBrowser';

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export type AccountEmailSectionProps = {
  prospectId: number;
};

/** Confirmed Gmail thread links for a prospect/account drawer (cache metadata only). */
export function AccountEmailSection({ prospectId }: AccountEmailSectionProps) {
  const [links, setLinks] = useState<GmailThreadLinkPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      const result = await listGmailLinksForProspectClient(prospectId);
      if (!active) return;
      if (!result.ok) {
        setLinks([]);
        setError(result.error);
        setLoading(false);
        return;
      }
      setLinks(result.links);
      setError(null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [prospectId]);

  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="font-heading m-0 text-sm tracking-wide uppercase">Email (Gmail)</h3>
      <p className="text-ink/55 m-0 text-xs">
        Confirmed Gmail links only. Open Messages → Email to read full threads (Gmail is source of
        truth).
      </p>
      {loading ? <p className="text-ink/60 m-0 text-xs">Loading linked email…</p> : null}
      {error ? (
        <p className="text-accent-800 m-0 text-xs" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && !error && links.length === 0 ? (
        <p className="text-ink/60 m-0 text-xs">No confirmed Gmail threads linked to this record.</p>
      ) : null}
      {!loading && !error && links.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {links.map((link) => (
            <li
              key={link.id}
              className="border-ink/10 bg-surface rounded-md border px-3 py-2 text-sm"
            >
              <p className="font-heading text-ink m-0 truncate">
                {link.subject || '(no subject)'}
                {link.unread ? ' · unread' : ''}
              </p>
              <p className="text-ink/55 m-0 mt-0.5 text-xs">
                {formatWhen(link.lastMessageAt)}
                {link.participants.length > 0
                  ? ` · ${link.participants.slice(0, 3).join(', ')}`
                  : ''}
              </p>
              {link.snippet ? (
                <p className="text-ink/50 m-0 mt-1 line-clamp-2 text-xs">{link.snippet}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
