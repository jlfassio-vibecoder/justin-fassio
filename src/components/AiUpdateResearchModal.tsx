import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import { Field, FieldLabel, Input } from '@/components/ui/Input';
import type { EnrichedProspectFields } from '@/lib/createEnrichedProspect';
import type { FillBlankProspectFields, ProspectResearchMode } from '@/lib/fillBlankProspectFields';
import { FILL_BLANK_ALLOWLIST, isBlankProspectValue } from '@/lib/fillBlankProspectFields';
import type { Prospect } from '@/lib/prospects';
import { buildResearchUpdateDiffs } from '@/lib/researchUpdateDiffs';
import {
  applyProspectResearchUpdate,
  previewProspectResearchUpdate,
} from '@/lib/updateProspectResearchClient';
import { useOptionalLineContext } from '@/lib/lineContext';
import { staffAiPostFields } from '@/lib/staffAiClientContext';

interface AiUpdateResearchModalProps {
  open: boolean;
  prospect: Prospect | null;
  onClose: () => void;
  onApplied: (prospect: Prospect) => void;
  /** `update` overwrites core fields; `fill-blanks` only fills empty web-fillable columns. */
  mode?: ProspectResearchMode;
}

export function AiUpdateResearchModal({
  open,
  prospect,
  onClose,
  onApplied,
  mode = 'update',
}: AiUpdateResearchModalProps) {
  if (!open || !prospect) return null;
  return (
    <AiUpdateResearchModalInner
      key={`${prospect.id}-${mode}`}
      prospect={prospect}
      onClose={onClose}
      onApplied={onApplied}
      mode={mode}
    />
  );
}

function AiUpdateResearchModalInner({
  prospect,
  onClose,
  onApplied,
  mode,
}: {
  prospect: Prospect;
  onClose: () => void;
  onApplied: (prospect: Prospect) => void;
  mode: ProspectResearchMode;
}) {
  const line = useOptionalLineContext();
  const fillBlanks = mode === 'fill-blanks';
  const [websiteUrl, setWebsiteUrl] = useState(prospect.website?.trim() ?? '');
  const [busyPreview, setBusyPreview] = useState(true);
  const [busyApply, setBusyApply] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<EnrichedProspectFields | FillBlankProspectFields | null>(
    null,
  );
  const [current, setCurrent] = useState<Prospect | null>(null);
  const [proposed, setProposed] = useState<Prospect | null>(null);

  useEffect(() => {
    let active = true;

    void staffAiPostFields({
      multiLineAi: line.multiLineAi,
      salesLineId: line.salesLineId,
      prospectId: prospect.id,
    })
      .then((aiFields) =>
        previewProspectResearchUpdate({
          prospectId: prospect.id,
          websiteUrl: prospect.website?.trim() || undefined,
          mode,
          salesLineId: aiFields.salesLineId,
          retailerLineAccountId: aiFields.retailerLineAccountId,
        }),
      )
      .then((result) => {
        if (!active) return;
        setBusyPreview(false);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setCurrent(result.preview.current);
        setProposed(result.preview.proposed);
        setFields(result.preview.fields);
      });

    return () => {
      active = false;
    };
  }, [prospect.id, prospect.website, mode, line.multiLineAi, line.salesLineId]);

  const diffs = current && proposed ? buildResearchUpdateDiffs(current, proposed, mode) : [];
  const busy = busyPreview || busyApply;

  function handleClose() {
    if (busy) return;
    onClose();
  }

  async function handleResearchAgain() {
    setBusyPreview(true);
    setError(null);
    setFields(null);
    setProposed(null);
    const result = await previewProspectResearchUpdate({
      prospectId: prospect.id,
      websiteUrl: websiteUrl.trim() || undefined,
      mode,
      ...(await staffAiPostFields({
        multiLineAi: line.multiLineAi,
        salesLineId: line.salesLineId,
        prospectId: prospect.id,
      })),
    });
    setBusyPreview(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCurrent(result.preview.current);
    setProposed(result.preview.proposed);
    setFields(result.preview.fields);
  }

  async function handleConfirm() {
    if (!fields) return;
    setBusyApply(true);
    setError(null);
    const result = await applyProspectResearchUpdate({
      prospectId: prospect.id,
      fields,
      mode,
      ...(await staffAiPostFields({
        multiLineAi: line.multiLineAi,
        salesLineId: line.salesLineId,
        prospectId: prospect.id,
      })),
    });
    setBusyApply(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onApplied(result.prospect);
    onClose();
  }

  return (
    <DialogBackdrop open onClose={handleClose}>
      <div className="gap-3.1 bg-surface p-4.1 flex max-w-[620px] flex-col rounded-xl shadow-lg">
        <div className="flex items-center justify-between">
          <DialogTitle>{fillBlanks ? 'Fill Blank Fields' : 'AI Update'}</DialogTitle>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="text-ink/60 hover:text-ink rounded p-1 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-ink/65 m-0 text-sm">
          {fillBlanks ? (
            <>
              Research <strong>{prospect.name}</strong> (ID {prospect.id}) for public address,
              phone, website, and apparel evidence. Empty fit score, priority, grade, and opening
              units are calculated by the app — not invented by the model. Buyer verified, Existing
              OGR, and External ID are never changed.
            </>
          ) : (
            <>
              Re-research <strong>{prospect.name}</strong> (ID {prospect.id}) from the web, review
              proposed changes, then confirm to update the directory row.
            </>
          )}
        </p>

        <Field>
          <FieldLabel>Website URL (optional)</FieldLabel>
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-[200px] flex-1"
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://"
              disabled={busy}
            />
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              disabled={busy}
              onClick={() => void handleResearchAgain()}
            >
              Re-run research
            </Button>
          </div>
        </Field>

        {busyPreview ? (
          <p className="text-ink/70 m-0 text-sm" role="status">
            Searching the web and enriching…
          </p>
        ) : null}

        {!busyPreview && fields && diffs.length === 0 ? (
          <p className="text-ink/70 m-0 text-sm" role="status">
            {fillBlanks && current
              ? fillBlanksEmptyMessage(current)
              : 'No field changes proposed — research matches the current row.'}
          </p>
        ) : null}

        {!busyPreview && diffs.length > 0 ? (
          <ul className="border-ink/15 m-0 max-h-72 list-none overflow-auto rounded-md border p-0">
            {diffs.map((d) => (
              <li key={d.key} className="border-ink/10 border-b px-3 py-2 text-sm last:border-b-0">
                <div className="text-ink/55 text-[11px] tracking-wider uppercase">{d.label}</div>
                <div className="text-ink/60 mt-0.5 line-through">{d.from}</div>
                <div className="text-ink mt-0.5 font-semibold">{d.to}</div>
              </li>
            ))}
          </ul>
        ) : null}

        {error ? (
          <p className="text-accent-800 m-0 text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !fields || diffs.length === 0}
            onClick={() => void handleConfirm()}
          >
            {busyApply ? 'Updating…' : fillBlanks ? 'Confirm fills' : 'Confirm update'}
          </Button>
        </div>
      </div>
    </DialogBackdrop>
  );
}

function fillBlanksEmptyMessage(current: Prospect): string {
  const blankKeys = FILL_BLANK_ALLOWLIST.filter((key) => isBlankProspectValue(key, current[key]));
  if (blankKeys.length === 0) {
    return 'No blank allowlisted fields to fill on this row.';
  }

  const researchedKeys = new Set([
    'address',
    'phone',
    'website',
    'apparelCapability',
    'verificationStatus',
  ]);
  const calculatedKeys = new Set([
    'fitScore',
    'idealOpeningUnits',
    'priority',
    'provisionalGrade',
    'fit',
    'nextAction',
    'subterritory',
    'primaryDistrict',
    'category',
    'region',
    'retailCategory',
  ]);

  const researchedBlank = blankKeys.filter((key) => researchedKeys.has(key));
  const calculatedBlank = blankKeys.filter((key) => calculatedKeys.has(key));

  if (researchedBlank.length > 0 && calculatedBlank.length === 0) {
    return 'Only address, phone, website, or apparel were blank; research found no public values to fill.';
  }
  if (calculatedBlank.length > 0 && researchedBlank.length === 0) {
    return 'Calculated planning fields were blank but could not be scored from the current category/territory.';
  }
  return 'Blank fields could not be filled — research found no public address/phone, and calculated fields needed more category/territory data.';
}
