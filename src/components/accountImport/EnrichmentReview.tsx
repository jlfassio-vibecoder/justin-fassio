import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import {
  REVIEW_REASON_LABELS,
  formatReviewValue,
  reviewFieldLabel,
  type ReviewSnapshot,
} from '@/lib/accountImport/reviewStatus';

export function EnrichmentReview({
  snapshot,
  busy,
  onApply,
  onReject,
  onSkipRemaining,
  onDone,
}: {
  snapshot: ReviewSnapshot | null;
  busy: boolean;
  onApply: (changeIds: string[]) => void;
  onReject: (changeIds: string[]) => void;
  onSkipRemaining?: () => void;
  onDone?: () => void;
}) {
  if (!snapshot) return <p className="m-0 text-sm">Loading pending field changes…</p>;
  if (snapshot.pendingCount === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="m-0 text-sm">No pending field changes.</p>
        {onDone ? (
          <div className="flex justify-end">
            <Button type="button" variant="primary" onClick={onDone}>
              Done
            </Button>
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm">
        {snapshot.pendingCount} pending field {snapshot.pendingCount === 1 ? 'change' : 'changes'}{' '}
        across {snapshot.groups.length} {snapshot.groups.length === 1 ? 'retailer' : 'retailers'}.
      </p>
      <ul className="m-0 max-h-[50vh] list-none overflow-auto p-0">
        {snapshot.groups.map((group) => (
          <li key={group.retailerId} className="border-ink/10 border-b py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-semibold">{group.name}</span>
                {group.reasons.length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {group.reasons.map((reason) => (
                      <Tag key={reason} variant="outline">
                        {REVIEW_REASON_LABELS[reason]}
                      </Tag>
                    ))}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => onReject(group.changes.map((change) => change.id))}
                >
                  Reject remaining
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={busy}
                  onClick={() => onApply(group.changes.map((change) => change.id))}
                >
                  Apply remaining
                </Button>
              </div>
            </div>
            <ul className="m-0 mt-2 list-none p-0">
              {group.changes.map((change) => (
                <li key={change.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="m-0 font-medium">{reviewFieldLabel(change.fieldPath)}</p>
                      <p className="text-ink/70 m-0">
                        {formatReviewValue(change.oldValue)} → {formatReviewValue(change.newValue)}
                      </p>
                      <p className="text-ink/60 m-0 text-xs">
                        {change.confidence ?? 'unknown'} confidence
                        {change.sourceUrl ? ` · ${change.sourceUrl}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" disabled={busy} onClick={() => onReject([change.id])}>
                        Reject
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        disabled={busy}
                        onClick={() => onApply([change.id])}
                      >
                        Apply
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-end gap-2">
        {onSkipRemaining ? (
          <Button type="button" disabled={busy} onClick={onSkipRemaining}>
            Skip remaining
          </Button>
        ) : null}
        {onDone ? (
          <Button type="button" variant="primary" disabled={busy} onClick={onDone}>
            Done
          </Button>
        ) : null}
      </div>
    </div>
  );
}
