import { useState, type SubmitEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import { Field, FieldLabel, Input, Select, Textarea } from '@/components/ui/Input';
import { APPAREL_SEASON_LABELS, APPAREL_SEASONS } from '@/lib/apparelSeasons';
import { convertToActiveAccount } from '@/lib/convertToActiveAccount';
import { resolveOgrLineId } from '@/lib/lines';
import type { Prospect } from '@/lib/prospects';
import type { ApparelSeason } from '@/types/database';

interface ConvertAccountModalProps {
  open: boolean;
  prospect: Prospect | null;
  /** Prefill estimated CAD (e.g. from Log Call order value). */
  prefillAmountCad?: number | null;
  onClose: () => void;
  onConverted?: () => void;
}

function ConvertAccountForm({
  prospect,
  prefillAmountCad,
  onClose,
  onConverted,
}: {
  prospect: Prospect;
  prefillAmountCad: number | null;
  onClose: () => void;
  onConverted?: () => void;
}) {
  const [season, setSeason] = useState<ApparelSeason>('spring_summer');
  const [amountCad, setAmountCad] = useState(
    prefillAmountCad != null && prefillAmountCad > 0 ? String(prefillAmountCad) : '',
  );
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetAndClose() {
    setError(null);
    onClose();
  }

  async function runConvert(withOrder: boolean) {
    const accountId = prospect.id;
    const currentStatus = prospect.accountStatus;

    setError(null);
    setBusy(true);

    const amount = amountCad === '' ? 0 : Number(amountCad);
    if (withOrder && (Number.isNaN(amount) || amount < 0)) {
      setBusy(false);
      setError('Enter a valid order amount (CAD).');
      return;
    }

    let lineId: string | null = null;
    if (withOrder) {
      lineId = await resolveOgrLineId();
    }

    const result = await convertToActiveAccount({
      accountId,
      currentStatus,
      initialOrder: withOrder
        ? {
            season,
            totalAmountCad: amount,
            notes: notes.trim() || null,
            lineId,
          }
        : undefined,
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onConverted?.();
    resetAndClose();
  }

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    void runConvert(true);
  }

  return (
    <DialogBackdrop open onClose={busy ? () => {} : resetAndClose}>
      <form
        className="gap-3.1 bg-surface p-4.1 flex max-w-[560px] flex-col rounded-xl shadow-lg"
        onSubmit={handleSubmit}
      >
        <div className="flex items-center justify-between gap-3">
          <DialogTitle>Convert to Active Account</DialogTitle>
          <button
            type="button"
            onClick={resetAndClose}
            disabled={busy}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-transparent"
            aria-label="Close"
          >
            <X size={18} strokeWidth={2.75} />
          </button>
        </div>

        <p className="text-ink/75 m-0 text-sm">
          Promote <span className="text-ink font-semibold">{prospect.name}</span> to an active
          account and optionally log the initial wholesale order (Old Guys Rule).
        </p>

        <Field>
          <FieldLabel>Apparel season</FieldLabel>
          <Select
            value={season}
            onChange={(e) => setSeason(e.target.value as ApparelSeason)}
            disabled={busy}
          >
            {APPAREL_SEASONS.map((s) => (
              <option key={s} value={s}>
                {APPAREL_SEASON_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          <FieldLabel>Estimated order value (CAD)</FieldLabel>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="0"
            value={amountCad}
            onChange={(e) => setAmountCad(e.target.value)}
            disabled={busy}
          />
        </Field>

        <Field>
          <FieldLabel>Order notes</FieldLabel>
          <Textarea
            rows={3}
            placeholder="Line focus, ship window, buyer notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy}
          />
        </Field>

        {error ? (
          <p className="text-accent-800 m-0 text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={resetAndClose} disabled={busy}>
            Not now
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void runConvert(false)}
          >
            {busy ? 'Converting…' : 'Convert without order'}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Converting…' : 'Convert & log initial order'}
          </Button>
        </div>
      </form>
    </DialogBackdrop>
  );
}

export function ConvertAccountModal({
  open,
  prospect,
  prefillAmountCad = null,
  onClose,
  onConverted,
}: ConvertAccountModalProps) {
  if (!open || !prospect) return null;

  return (
    <ConvertAccountForm
      key={`${prospect.id}-${prefillAmountCad ?? 'none'}`}
      prospect={prospect}
      prefillAmountCad={prefillAmountCad}
      onClose={onClose}
      onConverted={onConverted}
    />
  );
}
