import { useState, type SubmitEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import { Field, FieldLabel, Input, Select, Textarea } from '@/components/ui/Input';
import { PROSPECTS_DATA } from '@/data/prospects';

const FEEDBACK_OPTIONS = [
  'Loves display rack',
  'Seasonal rush fit',
  'Pre-booked budget',
  'Wants higher margin',
];

interface LogCallModalProps {
  open: boolean;
  storeId: number | null;
  onClose: () => void;
  onStoreChange: (id: number) => void;
}

export function LogCallModal({ open, storeId, onClose, onStoreChange }: LogCallModalProps) {
  const [feedback, setFeedback] = useState<string[]>([]);

  if (!open) return null;

  const selected = storeId != null ? PROSPECTS_DATA.find((p) => p.id === storeId) : undefined;
  const modalChannel = selected?.category ?? '';
  const modalCity = selected ? `${selected.city} (${selected.region})` : '';

  function toggleFeedback(option: string) {
    setFeedback((prev) =>
      prev.includes(option) ? prev.filter((f) => f !== option) : [...prev, option],
    );
  }

  function handleClose() {
    setFeedback([]);
    onClose();
  }

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setFeedback([]);
    onClose();
  }

  return (
    <DialogBackdrop open={open} onClose={handleClose}>
      <form
        className="flex max-w-[560px] flex-col gap-3.1 rounded-xl bg-surface p-4.1 shadow-lg"
        onSubmit={handleSubmit}
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
          >
            {PROSPECTS_DATA.map((p) => (
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
            <Input placeholder="e.g. Dave Miller (Owner)" required />
          </Field>
          <Field>
            <FieldLabel>Call outcome</FieldLabel>
            <Select defaultValue="Closed PO / Written Order">
              <option>Closed PO / Written Order</option>
              <option>Sample Package Requested</option>
              <option>Follow-up Scheduled</option>
              <option>Left Message / Gatekeeper</option>
              <option>Not Interested / Bad Fit</option>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>PMF fit score</FieldLabel>
            <Select defaultValue="10">
              <option value="10">10 — Perfect fit</option>
              <option value="8">8 — Strong fit</option>
              <option value="6">6 — Moderate fit</option>
              <option value="3">3 — Low fit</option>
              <option value="1">1 — Poor fit</option>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Order value (CAD)</FieldLabel>
            <Input type="number" min="0" placeholder="0 if no PO yet" />
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
          <Textarea rows={3} placeholder="Call summary, buyer reaction…" />
        </Field>

        <div className="mt-1.5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Save Call Record
          </Button>
        </div>
      </form>
    </DialogBackdrop>
  );
}
