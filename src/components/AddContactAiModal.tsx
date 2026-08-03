import { useState, type SubmitEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import { Field, FieldLabel, Input } from '@/components/ui/Input';
import type { AccountContact } from '@/lib/accountContacts';
import { findCompanyMatches } from '@/lib/companyMatch';
import { enrichContact } from '@/lib/enrichContact';
import type { Prospect } from '@/lib/prospects';

const STATUS_LABEL: Record<Prospect['accountStatus'], string> = {
  prospect: 'Prospect',
  active_account: 'Active account',
  inactive: 'Inactive',
};

export type AddContactAiCreated = {
  prospect: Prospect;
  contact: AccountContact;
};

interface AddContactAiModalProps {
  open: boolean;
  prospects: Prospect[];
  onClose: () => void;
  onCreated: (result: AddContactAiCreated) => void;
}

type Step = 'form' | 'confirm';

export function AddContactAiModal({ open, prospects, onClose, onCreated }: AddContactAiModalProps) {
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [matches, setMatches] = useState<Prospect[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function resetForm() {
    setContactName('');
    setPhone('');
    setEmail('');
    setCompanyName('');
    setWebsiteUrl('');
    setStep('form');
    setMatches([]);
    setSelectedAccountId(null);
    setError(null);
  }

  function handleClose() {
    if (busy) return;
    resetForm();
    onClose();
  }

  async function runEnrich(mode: 'create_prospect' | 'attach', accountId?: number) {
    setBusy(true);
    setError(null);
    const result = await enrichContact({
      contactName: contactName.trim(),
      companyName: companyName.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      websiteUrl: websiteUrl.trim() || undefined,
      mode,
      accountId,
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    resetForm();
    onCreated({ prospect: result.prospect, contact: result.contact });
    onClose();
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const name = contactName.trim();
    const company = companyName.trim();
    if (!name) {
      setError('Contact name is required.');
      return;
    }
    if (!company) {
      setError('Company name is required.');
      return;
    }

    const found = findCompanyMatches(company, prospects);
    if (found.length > 0) {
      setMatches(found);
      setSelectedAccountId(found[0]!.id);
      setStep('confirm');
      return;
    }

    await runEnrich('create_prospect');
  }

  return (
    <DialogBackdrop open={open} onClose={handleClose}>
      <form
        className="gap-3.1 bg-surface p-4.1 flex max-w-[560px] flex-col rounded-xl shadow-lg"
        onSubmit={(e) => void handleSubmit(e)}
      >
        <div className="flex items-center justify-between">
          <DialogTitle>
            {step === 'confirm' ? 'Company already in directory' : 'Add contact via AI'}
          </DialogTitle>
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

        {step === 'form' ? (
          <>
            <p className="text-ink/65 m-0 text-sm">
              Enter the contact and company. We infer store channel, BC region, city, and fit notes,
              then add the contact (and new prospect when needed). Phone and email are used when you
              provide them.
            </p>

            <Field>
              <FieldLabel>Contact name</FieldLabel>
              <Input
                id="ai-contact-name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="e.g. Sarah Jenkins"
                disabled={busy}
                autoFocus
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field>
                <FieldLabel>Phone (optional)</FieldLabel>
                <Input
                  id="ai-contact-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="250-555-0100"
                  disabled={busy}
                />
              </Field>
              <Field>
                <FieldLabel>Email (optional)</FieldLabel>
                <Input
                  id="ai-contact-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="buyer@store.com"
                  disabled={busy}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel>Company name</FieldLabel>
              <Input
                id="ai-contact-company"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Coastal Outfitters Nanaimo"
                disabled={busy}
                required
              />
            </Field>

            <Field>
              <FieldLabel>Company URL (optional)</FieldLabel>
              <Input
                id="ai-contact-url"
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://"
                disabled={busy}
              />
            </Field>
          </>
        ) : (
          <>
            <p className="text-ink/65 m-0 text-sm">
              “{companyName.trim()}” looks like a store already in your directory. Attach{' '}
              <strong>{contactName.trim()}</strong> to an existing store, or create a new prospect
              anyway.
            </p>

            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="sr-only">Matching stores</legend>
              {matches.map((p) => (
                <label
                  key={p.id}
                  className="border-ink/15 flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <input
                    type="radio"
                    name="attach-account"
                    className="mt-1"
                    checked={selectedAccountId === p.id}
                    onChange={() => setSelectedAccountId(p.id)}
                    disabled={busy}
                  />
                  <span>
                    <span className="font-semibold">
                      #{p.id} · {p.name}
                    </span>
                    <span className="text-ink/65 block text-xs">
                      {p.city} · {STATUS_LABEL[p.accountStatus]}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          </>
        )}

        {busy && (
          <p className="text-ink/70 m-0 text-sm" role="status">
            {step === 'confirm' ? 'Saving contact…' : 'Searching the web and enriching…'}
          </p>
        )}
        {error && (
          <p className="text-accent-800 m-0 text-sm" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {step === 'confirm' ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setStep('form');
                  setMatches([]);
                  setSelectedAccountId(null);
                  setError(null);
                }}
              >
                Back
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void runEnrich('create_prospect')}
              >
                Create new prospect
              </Button>
              <Button
                type="button"
                disabled={busy || selectedAccountId == null}
                onClick={() => {
                  if (selectedAccountId != null) {
                    void runEnrich('attach', selectedAccountId);
                  }
                }}
              >
                Attach to selected
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={handleClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !contactName.trim() || !companyName.trim()}>
                {busy ? 'Searching…' : 'Add via AI'}
              </Button>
            </>
          )}
        </div>
      </form>
    </DialogBackdrop>
  );
}
