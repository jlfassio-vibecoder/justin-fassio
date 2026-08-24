import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import { Field, FieldLabel, Select } from '@/components/ui/Input';
import { fetchContactsForAccount } from '@/lib/accountContacts';
import {
  accountProductEmailRecipientHint,
  defaultAccountProductEmailContact,
  toAccountProductEmailRecipientOptions,
  type AccountProductEmailRecipientOption,
} from '@/lib/accountProductEmailRecipient';
import type { ResearchDraftContact } from '@/lib/accountResearchDraftHandoff';

export type AccountResearchContactPickModalProps = {
  open: boolean;
  accountId: number;
  onClose: () => void;
  onPick: (contact: ResearchDraftContact) => void;
};

export function AccountResearchContactPickModal({
  open,
  accountId,
  onClose,
  onPick,
}: AccountResearchContactPickModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recipientOptions, setRecipientOptions] = useState<AccountProductEmailRecipientOption[]>(
    [],
  );
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [recipientHint, setRecipientHint] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void (async () => {
      setLoading(true);
      setError(null);
      const result = await fetchContactsForAccount(accountId);
      if (!active) return;
      setLoading(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      const contacts = result.data;
      const options = toAccountProductEmailRecipientOptions(contacts);
      const defaultContact = defaultAccountProductEmailContact(contacts);
      setRecipientOptions(options);
      setSelectedContactId(defaultContact?.id ?? null);
      setRecipientHint(accountProductEmailRecipientHint(contacts));
    })();
    return () => {
      active = false;
    };
  }, [open, accountId]);

  if (!open) return null;

  const selected = recipientOptions.find((o) => o.id === selectedContactId) ?? null;

  return (
    <DialogBackdrop open overlayClassName="z-[70]" panelClassName="max-w-md" onClose={onClose}>
      <div className="bg-surface p-4.1 flex flex-col gap-3 rounded-xl shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <DialogTitle>Choose email recipient</DialogTitle>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-transparent"
            aria-label="Close"
          >
            <X size={18} strokeWidth={2.75} />
          </button>
        </div>

        {loading ? (
          <p className="text-ink/60 m-0 text-sm">Loading contacts…</p>
        ) : error ? (
          <p className="text-error m-0 text-sm">{error}</p>
        ) : recipientOptions.length === 0 ? (
          <p className="text-ink/60 m-0 text-sm">
            Add a contact with an email before generating a draft.
          </p>
        ) : (
          <>
            <Field>
              <FieldLabel>Recipient</FieldLabel>
              <Select
                id="research-contact-select"
                value={selectedContactId ?? ''}
                onChange={(e) => setSelectedContactId(e.target.value || null)}
              >
                {recipientOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} ({option.email})
                  </option>
                ))}
              </Select>
            </Field>
            {recipientHint ? <p className="text-ink/55 m-0 text-xs">{recipientHint}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!selected?.email}
                onClick={() => {
                  if (!selected?.email || !selected.id) return;
                  onPick({
                    accountContactId: selected.id,
                    toEmail: selected.email,
                    toName: selected.name,
                  });
                }}
              >
                Continue
              </Button>
            </div>
          </>
        )}
      </div>
    </DialogBackdrop>
  );
}
