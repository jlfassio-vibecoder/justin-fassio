import { Button } from '@/components/ui/Button';
import type { EnrichmentSnapshot } from '@/lib/accountImport/enrichStatus';
import { canRetryFailedEnrich } from '@/lib/accountImport/enrichStatus';

export function EnrichmentProgress({
  snapshot,
  busy,
  onRetryFailed,
  onCancelRemaining,
  onDone,
  onReviewPending,
}: {
  snapshot: EnrichmentSnapshot | null;
  busy: boolean;
  onRetryFailed?: () => void;
  onCancelRemaining?: () => void;
  onDone?: () => void;
  onReviewPending?: () => void;
}) {
  if (!snapshot) return <p className="m-0 text-sm">Starting AI fill-blanks…</p>;
  const done = snapshot.jobs.completed + snapshot.jobs.failed + snapshot.jobs.cancelled;
  const remaining = snapshot.jobs.queued + snapshot.jobs.running;
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm">
        Enriching {done + remaining > 0 ? `${done} / ${snapshot.jobs.total}` : '0 / 0'} —{' '}
        {snapshot.jobs.completed} completed, {snapshot.jobs.failed} failed
        {snapshot.jobs.pendingFieldChanges > 0
          ? `, ${snapshot.jobs.pendingFieldChanges} pending review`
          : ''}
        .
      </p>
      {snapshot.pauseReason === 'rate_limit' ? (
        <p className="m-0 text-sm text-red-700">Rate limited. Remaining jobs stayed queued.</p>
      ) : null}
      <ul className="m-0 max-h-[30vh] list-none overflow-auto p-0">
        {snapshot.rows.map((row) => (
          <li key={row.id} className="py-1 text-sm">
            Retailer #{row.retailerId} {row.status}
            {row.error ? <span className="text-ink/60"> — {row.error}</span> : null}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-end gap-2">
        {remaining > 0 && onCancelRemaining ? (
          <Button type="button" disabled={busy} onClick={onCancelRemaining}>
            Cancel remaining
          </Button>
        ) : null}
        {canRetryFailedEnrich(snapshot) && onRetryFailed ? (
          <Button type="button" disabled={busy} onClick={onRetryFailed}>
            Retry failed
          </Button>
        ) : null}
        {onDone && remaining === 0 && (snapshot.jobs.pendingFieldChanges ?? 0) === 0 ? (
          <Button type="button" variant="primary" onClick={onDone}>
            Done
          </Button>
        ) : null}
        {onReviewPending && remaining === 0 && snapshot.jobs.pendingFieldChanges > 0 ? (
          <Button type="button" variant="primary" onClick={onReviewPending}>
            Review pending
          </Button>
        ) : null}
      </div>
    </div>
  );
}
