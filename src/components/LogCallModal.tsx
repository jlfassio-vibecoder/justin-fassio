import { useState, type SubmitEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import { Field, FieldLabel, Input, Select, Textarea } from '@/components/ui/Input';
import type { Prospect } from '@/lib/prospects';
import { useAiAssist } from '@/hooks/useAiAssist';
import { buildAssistDraft } from '@/lib/aiAssistPrefill';
import { supabase } from '@/lib/supabase';
import type { CallInsert } from '@/types/database';

const FEEDBACK_OPTIONS = [
  'Loves display rack',
  'Seasonal rush fit',
  'Pre-booked budget',
  'Wants higher margin',
];

const OUTCOME_OPTIONS = [
  'Closed PO / Written Order',
  'Sample Package Requested',
  'Follow-up Scheduled',
  'Left Message / Gatekeeper',
  'Not Interested / Bad Fit',
] as const;

interface LogCallModalProps {
  open: boolean;
  prospects: Prospect[];
  storeId: number | null;
  onClose: () => void;
  onStoreChange: (id: number) => void;
  onSaved?: () => void;
}

function resetFormState(setters: {
  setFeedback: (v: string[]) => void;
  setContactName: (v: string) => void;
  setOutcome: (v: string) => void;
  setPmfScore: (v: string) => void;
  setOrderValue: (v: string) => void;
  setNotes: (v: string) => void;
  setError: (v: string | null) => void;
}) {
  setters.setFeedback([]);
  setters.setContactName('');
  setters.setOutcome(OUTCOME_OPTIONS[0]);
  setters.setPmfScore('10');
  setters.setOrderValue('');
  setters.setNotes('');
  setters.setError(null);
}

export function LogCallModal({
  open,
  prospects,
  storeId,
  onClose,
  onStoreChange,
  onSaved,
}: LogCallModalProps) {
  const { openAssist } = useAiAssist();
  const [feedback, setFeedback] = useState<string[]>([]);
  const [contactName, setContactName] = useState('');
  const [outcome, setOutcome] = useState<string>(OUTCOME_OPTIONS[0]);
  const [pmfScore, setPmfScore] = useState('10');
  const [orderValue, setOrderValue] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const selected = storeId != null ? prospects.find((p) => p.id === storeId) : undefined;
  const modalChannel = selected?.category ?? '';
  const modalCity = selected ? `${selected.city} (${selected.region})` : '';

  function toggleFeedback(option: string) {
    setFeedback((prev) =>
      prev.includes(option) ? prev.filter((f) => f !== option) : [...prev, option],
    );
  }

  function handleClose() {
    resetFormState({
      setFeedback,
      setContactName,
      setOutcome,
      setPmfScore,
      setOrderValue,
      setNotes,
      setError,
    });
    onClose();
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (storeId == null) {
      setError('Select a store prospect.');
      return;
    }

    const trimmedContact = contactName.trim();
    if (!trimmedContact) {
      setError('Contact name is required.');
      return;
    }

    const row: CallInsert = {
      prospect_id: storeId,
      contact_name: trimmedContact,
      outcome,
      pmf_score: Number(pmfScore),
      order_value_cad: orderValue === '' ? 0 : Number(orderValue),
      objection_tags: feedback,
      notes: notes.trim() || null,
    };

    setBusy(true);
    const { error: insertError } = await supabase.from('calls').insert(row);
    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    const chips = {
      prospectId: storeId,
      prospectName: selected?.name,
      outcome,
    };
    openAssist({ chips, draft: buildAssistDraft(chips) });

    resetFormState({
      setFeedback,
      setContactName,
      setOutcome,
      setPmfScore,
      setOrderValue,
      setNotes,
      setError,
    });
    onSaved?.();
    onClose();
  }

  return (
    <DialogBackdrop open={open} onClose={handleClose}>
      <form
        className="gap-3.1 bg-surface p-4.1 flex max-w-[560px] flex-col rounded-xl shadow-lg"
        onSubmit={(e) => void handleSubmit(e)}
      >
        <div className="flex items-center justify-between">
          <DialogTitle>Log Prospect Call</DialogTitle>
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-transparent"
            aria-label="Close"
          >
            <X size={18} strokeWidth={2.75} />
          </button>
        </div>

        <Field>
          <FieldLabel>Store prospect</FieldLabel>
          <Select
            value={storeId ?? ''}
            onChange={(e) => onStoreChange(parseInt(e.target.value, 10))}
            required
          >
            {prospects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.city}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>Retail channel</FieldLabel>
            <Input readOnly value={modalChannel} className="opacity-70" />
          </Field>
          <Field>
            <FieldLabel>City / Region</FieldLabel>
            <Input readOnly value={modalCity} className="opacity-70" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>Contact name &amp; title</FieldLabel>
            <Input
              placeholder="e.g. Dave Miller (Owner)"
              required
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>Call outcome</FieldLabel>
            <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              {OUTCOME_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>PMF fit score</FieldLabel>
            <Select value={pmfScore} onChange={(e) => setPmfScore(e.target.value)}>
              <option value="10">10 — Perfect fit</option>
              <option value="8">8 — Strong fit</option>
              <option value="6">6 — Moderate fit</option>
              <option value="3">3 — Low fit</option>
              <option value="1">1 — Poor fit</option>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Order value (CAD)</FieldLabel>
            <Input
              type="number"
              min="0"
              placeholder="0 if no PO yet"
              value={orderValue}
              onChange={(e) => setOrderValue(e.target.value)}
            />
          </Field>
        </div>

        <Field>
          <FieldLabel>Primary buyer feedback</FieldLabel>
          <div className="mb-2 flex flex-wrap gap-2">
            {FEEDBACK_OPTIONS.map((option) => (
              <label
                key={option}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-neutral-100 px-2.5 py-[3px] text-[11px] text-neutral-800"
              >
                <input
                  type="checkbox"
                  className="m-0"
                  checked={feedback.includes(option)}
                  onChange={() => toggleFeedback(option)}
                />
                {option}
              </label>
            ))}
          </div>
          <Textarea
            rows={3}
            placeholder="Call summary, buyer reaction…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        {error && <p className="text-accent-800 m-0 text-sm">{error}</p>}

        <div className="mt-1.5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save Call Record'}
          </Button>
        </div>
      </form>
    </DialogBackdrop>
  );
}
