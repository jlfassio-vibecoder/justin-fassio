import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, FieldLabel, Input, Select } from '@/components/ui/Input';
import {
  ACCOUNT_CONTACT_ROLES,
  accountContactRoleLabel,
  classifyAccountContactDuplicate,
  demoteAccountPrimaryContact,
  findPrimaryAccountContact,
  insertAccountContact,
  restoreAccountPrimaryContact,
  type AccountContact,
  type AccountContactDuplicateMatch,
} from '@/lib/accountContacts';
import type { AccountContactRole } from '@/types/database';

const emptyForm = {
  role: 'buyer' as AccountContactRole,
  fullName: '',
  title: '',
  phone: '',
  email: '',
  isPrimary: false,
};

export type AddAccountContactWriteOpts = {
  writesEnabled?: boolean;
  /** Required for retailer_line_contacts; no OGR fallback. */
  salesLineId?: string | null;
};

type Props = {
  accountId: number;
  existingContacts: AccountContact[];
  writeOpts?: AddAccountContactWriteOpts;
  onCreated: (contact: AccountContact) => void;
  onCancel: () => void;
  onSelectExisting: (contact: AccountContact) => void;
};

/**
 * Inline new-contact panel for Call Log (and similar). Reuses insertAccountContact —
 * same tables, RLA junction (when salesLineId + RLA exist), and RLS as Account Details.
 * Not a nested <form> so it can sit inside Log Call's form.
 */
export function AddAccountContactInline({
  accountId,
  existingContacts,
  writeOpts,
  onCreated,
  onCancel,
  onSelectExisting,
}: Props) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<AccountContactDuplicateMatch | null>(null);
  /** When true, skip name-only warning and insert on next save. */
  const [allowNameDuplicate, setAllowNameDuplicate] = useState(false);

  async function createContact(isPrimary: boolean, demotedPrimaryId: string | null) {
    setBusy(true);
    setError(null);

    const result = await insertAccountContact(
      {
        account_id: accountId,
        role: form.role,
        full_name: form.fullName.trim(),
        title: form.title.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        notes: null,
        is_primary: isPrimary,
      },
      writeOpts,
    );

    if (result.error || !result.data) {
      if (demotedPrimaryId) {
        const restored = await restoreAccountPrimaryContact(demotedPrimaryId, writeOpts);
        if (restored.error) {
          setError(
            `${result.error ?? 'Could not create contact.'} Also failed to restore previous primary: ${restored.error}`,
          );
        } else {
          setError(result.error ?? 'Could not create contact.');
        }
      } else {
        setError(result.error ?? 'Could not create contact.');
      }
      setBusy(false);
      return;
    }

    setBusy(false);
    setDuplicate(null);
    setAllowNameDuplicate(false);
    onCreated(result.data);
  }

  async function handleSave(options?: { skipNameWarning?: boolean }) {
    const fullName = form.fullName.trim();
    if (!fullName) {
      setError('Contact name is required.');
      return;
    }

    const match = classifyAccountContactDuplicate(existingContacts, {
      fullName,
      email: form.email,
    });
    if (match?.kind === 'email') {
      setDuplicate(match);
      setAllowNameDuplicate(false);
      setError(null);
      return;
    }
    if (match?.kind === 'name' && !options?.skipNameWarning && !allowNameDuplicate) {
      setDuplicate(match);
      setError(null);
      return;
    }

    let isPrimary = form.isPrimary;
    let demotedPrimaryId: string | null = null;
    if (isPrimary) {
      const currentPrimary = findPrimaryAccountContact(existingContacts);
      if (currentPrimary) {
        const ok = window.confirm(
          `${currentPrimary.fullName} is currently the primary contact. Make ${fullName} primary instead?`,
        );
        if (!ok) {
          isPrimary = false;
        } else {
          setBusy(true);
          const demoted = await demoteAccountPrimaryContact(currentPrimary.id, writeOpts);
          if (demoted.error) {
            setBusy(false);
            setError(demoted.error);
            return;
          }
          demotedPrimaryId = currentPrimary.id;
        }
      }
    }

    await createContact(isPrimary, demotedPrimaryId);
  }

  return (
    <div className="border-ink/15 flex flex-col gap-2 rounded-md border p-3">
      <p className="font-heading m-0 text-sm">New contact</p>

      {duplicate?.kind === 'email' ? (
        <div className="bg-bg/80 flex flex-col gap-2 rounded-md px-2.5 py-2 text-sm" role="status">
          <p className="text-ink m-0">
            A contact with this email already exists:{' '}
            <span className="font-semibold">{duplicate.contact.fullName}</span>
            {duplicate.contact.email ? ` (${duplicate.contact.email})` : ''}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              className="px-3 py-1 text-xs"
              onClick={() => onSelectExisting(duplicate.contact)}
            >
              Use existing contact
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-1 text-xs"
              onClick={() => setDuplicate(null)}
            >
              Edit details
            </Button>
          </div>
        </div>
      ) : null}

      {duplicate?.kind === 'name' ? (
        <div className="bg-bg/80 flex flex-col gap-2 rounded-md px-2.5 py-2 text-sm" role="status">
          <p className="text-ink m-0">
            A contact with a similar name already exists:{' '}
            <span className="font-semibold">{duplicate.contact.fullName}</span>
            {duplicate.contact.email ? ` (${duplicate.contact.email})` : ''}. You can use that
            contact or create a new one anyway.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              className="px-3 py-1 text-xs"
              onClick={() => onSelectExisting(duplicate.contact)}
            >
              Use existing contact
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-1 text-xs"
              onClick={() => {
                setAllowNameDuplicate(true);
                setDuplicate(null);
                void handleSave({ skipNameWarning: true });
              }}
            >
              Create anyway
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-1 text-xs"
              onClick={() => setDuplicate(null)}
            >
              Edit details
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Field>
          <FieldLabel>Role</FieldLabel>
          <Select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AccountContactRole }))}
            disabled={busy}
          >
            {ACCOUNT_CONTACT_ROLES.map((role) => (
              <option key={role} value={role}>
                {accountContactRoleLabel(role)}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <FieldLabel>Full name</FieldLabel>
          <Input
            required
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            disabled={busy}
            placeholder="e.g. Dave Miller"
          />
        </Field>
        <Field>
          <FieldLabel>Title</FieldLabel>
          <Input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            disabled={busy}
            placeholder="Optional"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <FieldLabel>Email</FieldLabel>
            <Input
              type="email"
              aria-label="Email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              disabled={busy}
            />
          </Field>
          <Field>
            <FieldLabel>Phone</FieldLabel>
            <Input
              type="tel"
              aria-label="Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              disabled={busy}
            />
          </Field>
        </div>
        <label className="text-ink inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isPrimary}
            onChange={(e) => setForm((f) => ({ ...f, isPrimary: e.target.checked }))}
            disabled={busy}
          />
          Primary contact
        </label>

        {error ? (
          <p className="text-accent-800 m-0 text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={busy || duplicate?.kind === 'email'}
            onClick={() => void handleSave()}
          >
            {busy ? 'Saving…' : 'Save contact'}
          </Button>
        </div>
      </div>
    </div>
  );
}
