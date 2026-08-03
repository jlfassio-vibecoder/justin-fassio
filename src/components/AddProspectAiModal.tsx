import { useState, type SubmitEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import { Field, FieldLabel, Input } from '@/components/ui/Input';
import { enrichProspect } from '@/lib/enrichProspect';
import type { Prospect } from '@/lib/prospects';

interface AddProspectAiModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (prospect: Prospect) => void;
}

export function AddProspectAiModal({ open, onClose, onCreated }: AddProspectAiModalProps) {
  const [companyName, setCompanyName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function handleClose() {
    if (busy) return;
    setCompanyName('');
    setWebsiteUrl('');
    setError(null);
    onClose();
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const name = companyName.trim();
    if (!name) {
      setError('Company name is required.');
      return;
    }

    setBusy(true);
    const result = await enrichProspect({
      companyName: name,
      websiteUrl: websiteUrl.trim() || undefined,
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setCompanyName('');
    setWebsiteUrl('');
    setError(null);
    onCreated(result.prospect);
    onClose();
  }

  return (
    <DialogBackdrop open={open} onClose={handleClose}>
      <form
        className="gap-3.1 bg-surface p-4.1 flex max-w-[560px] flex-col rounded-xl shadow-lg"
        onSubmit={(e) => void handleSubmit(e)}
      >
        <div className="flex items-center justify-between">
          <DialogTitle>Add prospect via AI</DialogTitle>
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
          Enter a company name (and optional website). We infer channel, BC region, city, and fit
          notes, then add the row to your directory.
        </p>

        <Field>
          <FieldLabel>Company name</FieldLabel>
          <Input
            id="ai-prospect-name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. Coastal Outfitters Nanaimo"
            disabled={busy}
            autoFocus
            required
          />
        </Field>

        <Field>
          <FieldLabel>Website URL (optional)</FieldLabel>
          <Input
            id="ai-prospect-url"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://"
            disabled={busy}
          />
        </Field>

        {busy && (
          <p className="text-ink/70 m-0 text-sm" role="status">
            Enriching prospect details…
          </p>
        )}
        {error && (
          <p className="text-accent-800 m-0 text-sm" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !companyName.trim()}>
            {busy ? 'Enriching…' : 'Add via AI'}
          </Button>
        </div>
      </form>
    </DialogBackdrop>
  );
}
