import { useEffect, useState } from 'react';
import {
  fetchProductOutreachHistory,
  type ProductOutreachHistoryItem,
} from '@/lib/systemMessages';

export type ProductEmailHistoryProps = {
  catalogItemId: string;
  reloadToken?: number;
};

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatStatus(status: string): string {
  if (!status) return '—';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatRecipient(item: ProductOutreachHistoryItem): string {
  const name = item.toName?.trim();
  if (name) return `${name} · ${item.toEmail}`;
  return item.toEmail;
}

function formatCrm(item: ProductOutreachHistoryItem): string {
  if (item.prospectId == null && item.accountContactId == null) {
    return 'Unlinked';
  }
  const parts: string[] = [];
  if (item.prospectName) parts.push(item.prospectName);
  else if (item.prospectId != null) parts.push(`Account #${item.prospectId}`);
  if (item.contactName) parts.push(item.contactName);
  return parts.length > 0 ? parts.join(' · ') : 'Unlinked';
}

export function ProductEmailHistory({ catalogItemId, reloadToken = 0 }: ProductEmailHistoryProps) {
  const [items, setItems] = useState<ProductOutreachHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    void (async () => {
      const result = await fetchProductOutreachHistory(catalogItemId);
      if (!active) return;
      if (result.error) {
        setItems([]);
        setError(result.error);
        setLoading(false);
        return;
      }
      setItems(result.data);
      setError(null);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [catalogItemId, reloadToken]);

  return (
    <div className="sm:col-span-2">
      <p className="text-ink/55 m-0 mb-2 text-xs font-medium tracking-wide uppercase">
        Product email history
      </p>
      {loading ? <p className="text-ink/60 m-0 text-sm">Loading email history…</p> : null}
      {error ? (
        <p className="text-accent-800 m-0 text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <p className="text-ink/60 m-0 text-sm">No product emails sent yet.</p>
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((item) => (
            <li
              key={item.id}
              className="border-ink/10 text-ink rounded-md border px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="m-0 font-medium">{formatRecipient(item)}</p>
                <p className="text-ink/55 m-0 shrink-0 text-xs">{formatWhen(item.sentAt)}</p>
              </div>
              <p className="text-ink/60 m-0 mt-1 text-xs">
                <span className="text-ink/80">{formatStatus(item.status)}</span>
                <span className="text-ink/40"> · </span>
                {formatCrm(item)}
              </p>
              <p className="text-ink/55 m-0 mt-0.5 text-xs">
                Opens {item.openCount} · Clicks {item.clickCount}
              </p>
              {item.failureReason &&
              (item.status === 'bounced' || item.status === 'failed') ? (
                <p className="text-accent-800 m-0 mt-0.5 text-xs">{item.failureReason}</p>
              ) : null}
              {item.subject.trim() ? (
                <p className="text-ink/50 m-0 mt-0.5 truncate text-xs">{item.subject}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
