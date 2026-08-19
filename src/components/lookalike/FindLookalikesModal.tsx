import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import { Tag } from '@/components/ui/Tag';
import {
  cancelLookalikeJobClient,
  listLookalikeSeedsClient,
  processLookalikeJobClient,
  reviewLookalikeCandidateClient,
  startLookalikeJobClient,
} from '@/lib/lookalike/client';
import { LOOKALIKE_LINE_CODE, LOOKALIKE_MAX_SEEDS } from '@/lib/lookalike/classification';
import type {
  LookalikeCandidateView,
  LookalikeJobSnapshot,
  LookalikeSeedListItem,
} from '@/lib/lookalike/types';
import { fetchRepresentedLines } from '@/lib/lines';
import { useOptionalLineContext } from '@/lib/lineContext';

type WizardStep = 'seeds' | 'searching' | 'review';

interface FindLookalikesModalProps {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}

function candidateLocation(row: LookalikeCandidateView): string {
  return [row.city, row.state?.toUpperCase()].filter(Boolean).join(', ') || '—';
}

function statusLabel(row: LookalikeCandidateView): string {
  if (row.status === 'already_in_crm') return 'Already in CRM';
  if (row.status === 'approved') return 'Approved';
  if (row.status === 'rejected') return 'Rejected';
  return 'Net-new';
}

export function FindLookalikesModal({ open, onClose, onImported }: FindLookalikesModalProps) {
  const lineCtx = useOptionalLineContext();
  const [salesLineId, setSalesLineId] = useState('');
  const [seeds, setSeeds] = useState<LookalikeSeedListItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [step, setStep] = useState<WizardStep>('seeds');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<LookalikeJobSnapshot | null>(null);
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  // Copilot suggestion ignored: useEffect setState fails react-hooks/set-state-in-effect; render-time prop sync is the React-supported pattern.
  if (open && !resetOpen) {
    setResetOpen(true);
    setError(null);
    setStep('seeds');
    setSnapshot(null);
    setSelectedIds([]);
    setSeeds([]);
    setBusy(false);
    setReviewBusyId(null);
  }
  if (!open && resetOpen) {
    setResetOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    let active = true;
    void (async () => {
      const current =
        lineCtx.lineSlug === LOOKALIKE_LINE_CODE || !lineCtx.multiLineUi
          ? lineCtx.salesLineId
          : null;
      let lineId = current?.trim() || '';
      if (!lineId) {
        const lines = await fetchRepresentedLines();
        if (!active) return;
        if (lines.error) {
          setError(lines.error);
          return;
        }
        lineId = lines.data.find((line) => line.code === LOOKALIKE_LINE_CODE)?.id ?? '';
      }
      if (!lineId) {
        setError('Old Guys Rule is not available');
        return;
      }
      setSalesLineId(lineId);
      const listed = await listLookalikeSeedsClient({ salesLineId: lineId });
      if (!active) return;
      if (!listed.ok) {
        setError(listed.error);
        return;
      }
      setSeeds(listed.seeds);
    })();
    return () => {
      active = false;
    };
  }, [open, lineCtx.lineSlug, lineCtx.multiLineUi, lineCtx.salesLineId]);

  const selectedCount = selectedIds.length;
  const canRun = selectedCount >= 1 && selectedCount <= LOOKALIKE_MAX_SEEDS && Boolean(salesLineId);
  const candidates = snapshot?.candidates ?? [];
  const approvedCount = candidates.filter((row) => row.status === 'approved').length;

  function toggleSeed(id: number) {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= LOOKALIKE_MAX_SEEDS) return current;
      return [...current, id];
    });
  }

  async function handleRun() {
    if (!canRun) return;
    setBusy(true);
    setError(null);
    setStep('searching');
    const started = await startLookalikeJobClient({
      salesLineId,
      seedRetailerIds: selectedIds,
    });
    if (!started.ok) {
      setBusy(false);
      setStep('seeds');
      setError(started.error);
      return;
    }
    setSnapshot(started.snapshot);
    const processed = await processLookalikeJobClient({
      salesLineId,
      jobId: started.snapshot.jobId,
    });
    setBusy(false);
    if (!processed.ok) {
      setError(processed.error);
      setStep('review');
      return;
    }
    setSnapshot(processed.snapshot);
    setStep('review');
  }

  async function handleCancel() {
    if (!snapshot) {
      onClose();
      return;
    }
    setBusy(true);
    const result = await cancelLookalikeJobClient({
      salesLineId,
      jobId: snapshot.jobId,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSnapshot(result.snapshot);
    onClose();
  }

  async function handleReview(candidateId: string, action: 'approve' | 'reject') {
    if (!snapshot) return;
    setReviewBusyId(candidateId);
    setError(null);
    const result = await reviewLookalikeCandidateClient({
      salesLineId,
      jobId: snapshot.jobId,
      candidateId,
      action,
    });
    setReviewBusyId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSnapshot(result.snapshot);
    if (action === 'approve') onImported?.();
  }

  return (
    <DialogBackdrop open={open} onClose={busy ? () => {} : onClose} panelClassName="max-w-[860px]">
      <div className="gap-3.1 bg-surface p-4.1 flex max-h-[90vh] flex-col overflow-auto rounded-xl shadow-lg">
        <div className="flex items-center justify-between">
          <DialogTitle>Find lookalikes</DialogTitle>
          <button
            type="button"
            className="text-ink/70 hover:text-ink"
            onClick={onClose}
            aria-label="Close"
            disabled={busy}
          >
            <X strokeWidth={2.75} className="h-5 w-5" />
          </button>
        </div>
        <p className="text-ink/60 m-0 text-xs">
          {step === 'seeds' &&
            'Pick 1–12 verified historical OGR purchasers. AI will propose net-new Oregon and Washington retailers for review.'}
          {step === 'searching' &&
            'Searching public web sources for similar independent OR/WA specialty retailers.'}
          {step === 'review' &&
            'Approve inserts an OGR prospect tagged lookalike. Rejected and already-in-CRM names are not inserted. Outreach is not enrolled.'}
        </p>
        {error ? (
          <p className="m-0 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        {step === 'seeds' ? (
          <>
            {seeds.length === 0 ? (
              <p className="text-ink/70 m-0 text-sm">
                No verified historical OGR purchasers are available as seeds.
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {seeds.map((seed) => {
                  const checked = selectedIds.includes(seed.retailerId);
                  const disabled = !checked && selectedCount >= LOOKALIKE_MAX_SEEDS;
                  return (
                    <li key={seed.retailerId}>
                      <label className="border-ink/15 flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleSeed(seed.retailerId)}
                        />
                        <span className="font-semibold">{seed.name}</span>
                        <span className="text-ink/60">
                          {[seed.city, seed.territoryCode?.toUpperCase()]
                            .filter(Boolean)
                            .join(', ')}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex items-center justify-between gap-2">
              <p className="text-ink/60 m-0 text-xs">
                {selectedCount} of {LOOKALIKE_MAX_SEEDS} selected
              </p>
              <Button variant="primary" onClick={() => void handleRun()} disabled={!canRun || busy}>
                <Sparkles strokeWidth={2.75} className="h-4 w-4" />
                Run lookalikes
              </Button>
            </div>
          </>
        ) : null}

        {step === 'searching' ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-ink/70 m-0 text-sm" role="status">
              Searching Oregon and Washington retailers…
            </p>
            <Button variant="secondary" onClick={() => void handleCancel()} disabled={!snapshot}>
              Cancel
            </Button>
          </div>
        ) : null}

        {step === 'review' ? (
          <>
            {snapshot?.status === 'failed' ? (
              <p className="m-0 text-sm text-red-700" role="alert">
                {snapshot.error || 'Lookalike search failed'}
              </p>
            ) : null}
            {snapshot?.status === 'cancelled' ? (
              <p className="text-ink/70 m-0 text-sm">Search cancelled.</p>
            ) : null}
            {candidates.length === 0 && snapshot?.status === 'proposed' ? (
              <p className="text-ink/70 m-0 text-sm">No net-new OR/WA retailers were proposed.</p>
            ) : null}
            {candidates.length > 0 ? (
              <div className="overflow-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr>
                      <th className="border-ink/10 border-b p-2">Name</th>
                      <th className="border-ink/10 border-b p-2">Location</th>
                      <th className="border-ink/10 border-b p-2">Why similar</th>
                      <th className="border-ink/10 border-b p-2">Status</th>
                      <th className="border-ink/10 border-b p-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((row) => {
                      const reviewable =
                        row.status === 'proposed' || row.status === 'already_in_crm';
                      return (
                        <tr key={row.id}>
                          <td className="border-ink/[0.08] border-b p-2 font-semibold">
                            {row.name}
                          </td>
                          <td className="border-ink/[0.08] border-b p-2">
                            {candidateLocation(row)}
                          </td>
                          <td className="border-ink/[0.08] text-ink/70 border-b p-2">
                            {row.evidence || '—'}
                          </td>
                          <td className="border-ink/[0.08] border-b p-2">
                            <Tag variant={row.status === 'proposed' ? 'accent' : 'neutral'}>
                              {statusLabel(row)}
                            </Tag>
                          </td>
                          <td className="border-ink/[0.08] border-b p-2 text-right">
                            {reviewable ? (
                              <div className="flex justify-end gap-1.5">
                                {row.status === 'proposed' ? (
                                  <Button
                                    variant="primary"
                                    className="px-3 py-1 text-xs"
                                    disabled={reviewBusyId === row.id}
                                    onClick={() => void handleReview(row.id, 'approve')}
                                  >
                                    Approve
                                  </Button>
                                ) : null}
                                <Button
                                  variant="secondary"
                                  className="px-3 py-1 text-xs"
                                  disabled={reviewBusyId === row.id}
                                  onClick={() => void handleReview(row.id, 'reject')}
                                >
                                  Reject
                                </Button>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <p className="text-ink/60 m-0 text-xs">
                {approvedCount} approved prospect{approvedCount === 1 ? '' : 's'}
              </p>
              <Button variant="secondary" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </DialogBackdrop>
  );
}
