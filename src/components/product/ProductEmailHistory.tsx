import { useEffect, useState } from 'react';
import {
  fetchProductOutreachHistory,
  SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL,
  SYSTEM_MESSAGE_ORIGIN_MANUAL_PRODUCT_EMAIL,
  type ProductOutreachHistoryItem,
} from '@/lib/systemMessages';
import { Button } from '@/components/ui/Button';

export type ProductEmailHistoryProps = {
  catalogItemId: string;
  onReviewDraft?: (item: ProductOutreachHistoryItem) => void;
};

type HistoryState = {
  items: ProductOutreachHistoryItem[];
  loading: boolean;
  error: string | null;
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

function formatOrigin(origin: string): string {
  if (origin === SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL) return 'Agent';
  if (origin === SYSTEM_MESSAGE_ORIGIN_MANUAL_PRODUCT_EMAIL) return 'Manual';
  return origin || '—';
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

/**
 * Remount with a new `key` (catalog item + reload token) to reset loading state
 * without synchronous setState inside the effect.
 */
export function ProductEmailHistory({ catalogItemId, onReviewDraft }: ProductEmailHistoryProps) {
  const [state, setState] = useState<HistoryState>({
    items: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let active = true;

    void (async () => {
      const result = await fetchProductOutreachHistory(catalogItemId);
      if (!active) return;

      if (result.error) {
        setState({
          items: [],
          loading: false,
          error: result.error,
        });
        return;
      }

      setState({
        items: result.data,
        loading: false,
        error: null,
      });
    })();

    return () => {
      active = false;
    };
  }, [catalogItemId]);

  const { items, loading, error } = state;

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
                <p className="text-ink/55 m-0 shrink-0 text-xs">
                  {item.status === 'draft' || item.status === 'cancelled'
                    ? formatWhen(item.createdAt)
                    : formatWhen(item.sentAt)}
                </p>
              </div>
              <p className="text-ink/60 m-0 mt-1 text-xs">
                <span className="text-ink/80">{formatOrigin(item.origin)}</span>
                <span className="text-ink/40"> · </span>
                <span className="text-ink/80">{formatStatus(item.status)}</span>
                <span className="text-ink/40"> · </span>
                {formatCrm(item)}
              </p>
              {item.status !== 'draft' && item.status !== 'cancelled' ? (
                <p className="text-ink/55 m-0 mt-0.5 text-xs">
                  Opens {item.openCount} · Clicks {item.clickCount}
                </p>
              ) : null}
              {item.status !== 'draft' &&
              item.status !== 'cancelled' &&
              (item.openCount > 0 || item.clickCount > 0)
                ? (() => {
                    const timing = [
                      item.openedAt ? `First open ${formatWhen(item.openedAt)}` : null,
                      item.lastOpenedAt && item.lastOpenedAt !== item.openedAt
                        ? `Last open ${formatWhen(item.lastOpenedAt)}`
                        : null,
                      item.clickedAt ? `First click ${formatWhen(item.clickedAt)}` : null,
                      item.lastClickedAt && item.lastClickedAt !== item.clickedAt
                        ? `Last click ${formatWhen(item.lastClickedAt)}`
                        : null,
                    ].filter(Boolean);
                    return timing.length > 0 ? (
                      <p className="text-ink/45 m-0 mt-0.5 text-xs">{timing.join(' · ')}</p>
                    ) : null;
                  })()
                : null}
              {item.failureReason && (item.status === 'bounced' || item.status === 'failed') ? (
                <p className="text-accent-800 m-0 mt-0.5 text-xs">{item.failureReason}</p>
              ) : null}
              {item.subject.trim() ? (
                <p className="text-ink/50 m-0 mt-0.5 truncate text-xs">{item.subject}</p>
              ) : null}
              {item.status === 'draft' &&
              item.origin === SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL &&
              onReviewDraft ? (
                <div className="mt-2">
                  <Button type="button" variant="secondary" onClick={() => onReviewDraft(item)}>
                    Review
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
