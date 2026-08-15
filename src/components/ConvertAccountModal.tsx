import { useEffect, useState, type SubmitEvent } from 'react';
import { X } from 'lucide-react';
import { MentionTextarea } from '@/components/MentionTextarea';
import { Button } from '@/components/ui/Button';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import { Field, FieldLabel, Input, Select } from '@/components/ui/Input';
import { APPAREL_SEASON_LABELS, APPAREL_SEASONS } from '@/lib/apparelSeasons';
import type { CatalogItem } from '@/lib/catalog';
import { convertToActiveAccount } from '@/lib/convertToActiveAccount';
import { useOptionalLineContext } from '@/lib/lineContext';
import { resolveOgrLineId } from '@/lib/lines';
import {
  listLinkedOutreachCandidates,
  type LinkedOutreachCandidate,
} from '@/lib/outreachAttribution';
import type { Prospect } from '@/lib/prospects';
import { isStaffSellingUiBlocked } from '@/lib/retailerLineAccounts';
import { supabase } from '@/lib/supabase';
import type { ApparelSeason, ConversionSource } from '@/types/database';

interface ConvertAccountModalProps {
  open: boolean;
  prospect: Prospect | null;
  /** Prefill estimated CAD (e.g. from Log Call order value). */
  prefillAmountCad?: number | null;
  catalog?: CatalogItem[];
  /** Default conversion source — `call` when opened from Log Call. */
  defaultConversionSource?: ConversionSource;
  onClose: () => void;
  onConverted?: () => void;
}

const NONE_VALUE = '__none__';

function ConvertAccountForm({
  prospect,
  prefillAmountCad,
  catalog,
  defaultConversionSource,
  onClose,
  onConverted,
}: {
  prospect: Prospect;
  prefillAmountCad: number | null;
  catalog?: CatalogItem[];
  defaultConversionSource: ConversionSource;
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
  const [candidates, setCandidates] = useState<LinkedOutreachCandidate[]>([]);
  const [linkedMessageId, setLinkedMessageId] = useState<string>(NONE_VALUE);
  const [conversionSource, setConversionSource] =
    useState<ConversionSource>(defaultConversionSource);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const line = useOptionalLineContext();
  const sellingBlocked = isStaffSellingUiBlocked(
    line.lineSlug && line.status ? { code: line.lineSlug, status: line.status } : null,
    line.multiLineWrites,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setCandidatesLoading(true);
      const result = await listLinkedOutreachCandidates({ prospectId: prospect.id });
      if (cancelled) return;
      if (result.ok && result.candidates.length > 0) {
        setCandidates(result.candidates);
        setLinkedMessageId(result.candidates[0]?.id ?? NONE_VALUE);
        if (defaultConversionSource === 'manual') {
          setConversionSource('outreach');
        }
      } else {
        setCandidates([]);
        setLinkedMessageId(NONE_VALUE);
      }
      setCandidatesLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [prospect.id, defaultConversionSource]);

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
      lineId = line.multiLineWrites ? line.salesLineId : await resolveOgrLineId();
    }

    const selectedId = linkedMessageId === NONE_VALUE ? null : linkedMessageId;
    let source = conversionSource;
    if (selectedId && source === 'manual') source = 'outreach';
    if (!selectedId && source === 'outreach') source = 'manual';

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const result = await convertToActiveAccount({
      accountId,
      currentStatus,
      writesEnabled: line.multiLineWrites,
      salesLineId: line.multiLineWrites ? line.salesLineId : null,
      initialOrder: withOrder
        ? {
            season,
            totalAmountCad: amount,
            notes: notes.trim() || null,
            lineId,
          }
        : undefined,
      attribution: {
        conversionSource: source,
        staffSelectedMessageId: selectedId,
        convertedBy: user?.id ?? null,
      },
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

  if (line.multiLineWrites && sellingBlocked) {
    return (
      <DialogBackdrop open onClose={resetAndClose}>
        <div className="gap-3.1 bg-surface p-4.1 flex max-w-[560px] flex-col rounded-xl shadow-lg">
          <DialogTitle>Convert to Active Account</DialogTitle>
          <p className="text-ink/75 m-0 text-sm">
            Selling for this line is not enabled yet. Convert stays available for Old Guys Rule.
          </p>
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={resetAndClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogBackdrop>
    );
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
          <MentionTextarea
            rows={3}
            placeholder="Line focus, ship window, buyer notes… Use # for products, @ for contacts"
            value={notes}
            onChange={setNotes}
            items={catalog}
            accountId={prospect.id}
            disabled={busy}
          />
        </Field>

        <Field>
          <FieldLabel>Conversion source</FieldLabel>
          <Select
            value={conversionSource}
            onChange={(e) => setConversionSource(e.target.value as ConversionSource)}
            disabled={busy}
          >
            <option value="outreach">Product outreach</option>
            <option value="call">Call</option>
            <option value="wholesale">Wholesale</option>
            <option value="manual">Manual / other</option>
          </Select>
        </Field>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="text-ink/70 m-0 text-[11px] tracking-wide uppercase">
            Linked outreach
          </legend>
          <p className="text-ink/60 m-0 text-xs">
            Confirm which product outreach contributed when possible. Journey history is preserved
            either way.
          </p>
          {candidatesLoading ? (
            <p className="text-ink/50 m-0 text-xs">Loading outreach…</p>
          ) : (
            <div className="flex max-h-40 flex-col gap-1.5 overflow-auto">
              <label className="text-ink flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="linked-outreach"
                  value={NONE_VALUE}
                  checked={linkedMessageId === NONE_VALUE}
                  onChange={() => setLinkedMessageId(NONE_VALUE)}
                  disabled={busy}
                  className="mt-1"
                />
                <span>None / not from outreach</span>
              </label>
              {candidates.map((c) => (
                <label key={c.id} className="text-ink flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="linked-outreach"
                    value={c.id}
                    checked={linkedMessageId === c.id}
                    onChange={() => setLinkedMessageId(c.id)}
                    disabled={busy}
                    className="mt-1"
                  />
                  <span>
                    {(c.productName || c.productSku || 'Product outreach').trim()}
                    <span className="text-ink/55">
                      {' '}
                      · {c.sentAt.slice(0, 10)} · {c.toEmail}
                    </span>
                  </span>
                </label>
              ))}
              {candidates.length === 0 ? (
                <p className="text-ink/50 m-0 text-xs">
                  No recent product outreach for this account.
                </p>
              ) : null}
            </div>
          )}
        </fieldset>

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
  catalog,
  defaultConversionSource = 'manual',
  onClose,
  onConverted,
}: ConvertAccountModalProps) {
  if (!open || !prospect) return null;

  return (
    <ConvertAccountForm
      key={`${prospect.id}-${prefillAmountCad ?? 'none'}-${defaultConversionSource}`}
      prospect={prospect}
      prefillAmountCad={prefillAmountCad}
      catalog={catalog}
      defaultConversionSource={defaultConversionSource}
      onClose={onClose}
      onConverted={onConverted}
    />
  );
}
