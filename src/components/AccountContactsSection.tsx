import { useCallback, useEffect, useState, type SubmitEvent } from 'react';
import { MentionTextarea } from '@/components/MentionTextarea';
import { Button } from '@/components/ui/Button';
import { Field, FieldLabel, Input, Select } from '@/components/ui/Input';
import { Tag } from '@/components/ui/Tag';
import {
  ACCOUNT_CONTACT_ROLES,
  accountContactRoleLabel,
  deleteAccountContact,
  fetchContactsForAccount,
  insertAccountContact,
  updateAccountContact,
  type AccountContact,
} from '@/lib/accountContacts';
import type { AccountContactRole } from '@/types/database';
import { useOptionalLineContext } from '@/lib/lineContext';
import { isStaffSellingUiBlocked } from '@/lib/retailerLineAccounts';

interface AccountContactsSectionProps {
  accountId: number;
  /** When bumped, refetch contacts (e.g. after Log Call creates a contact). */
  reloadToken?: number;
}

const emptyForm = {
  role: 'buyer' as AccountContactRole,
  fullName: '',
  title: '',
  phone: '',
  email: '',
  alternateEmail: '',
  notes: '',
  isPrimary: false,
};

export function AccountContactsSection({
  accountId,
  reloadToken: externalReloadToken = 0,
}: AccountContactsSectionProps) {
  const line = useOptionalLineContext();
  const sellingBlocked = isStaffSellingUiBlocked(
    line.lineSlug && line.status
      ? { code: line.lineSlug, status: line.status, defaultCurrency: line.defaultCurrency }
      : null,
    line.multiLineWrites,
    {
      eaglePeakSellingEnabled: line.eaglePeakSelling,
      bigFishSellingEnabled: line.bigFishSelling,
      defaultCurrency: line.defaultCurrency,
    },
  );
  const [contacts, setContacts] = useState<AccountContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [localReloadToken, setLocalReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    void (async () => {
      const result = await fetchContactsForAccount(accountId);
      if (!active) return;
      if (result.error) {
        setContacts([]);
        setError(result.error);
        setLoading(false);
        return;
      }
      setContacts(result.data);
      setError(null);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [accountId, externalReloadToken, localReloadToken]);

  const reload = useCallback(() => {
    setLoading(true);
    setLocalReloadToken((n) => n + 1);
  }, []);

  function startAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
    setError(null);
  }

  function startEdit(contact: AccountContact) {
    setEditingId(contact.id);
    setForm({
      role: contact.role,
      fullName: contact.fullName,
      title: contact.title ?? '',
      phone: contact.phone ?? '',
      email: contact.email ?? '',
      alternateEmail: contact.alternateEmail ?? '',
      notes: contact.notes ?? '',
      isPrimary: contact.isPrimary,
    });
    setShowForm(true);
    setError(null);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const fullName = form.fullName.trim();
    if (!fullName) {
      setError('Contact name is required.');
      return;
    }

    setBusy(true);
    setError(null);
    const payload = {
      role: form.role,
      full_name: fullName,
      title: form.title.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      alternate_email: form.alternateEmail.trim() || null,
      notes: form.notes.trim() || null,
      is_primary: form.isPrimary,
    };

    const writeOpts = {
      writesEnabled: line.multiLineWrites,
      salesLineId: line.salesLineId,
    };
    const result =
      editingId != null
        ? await updateAccountContact(editingId, payload, writeOpts)
        : await insertAccountContact({ account_id: accountId, ...payload }, writeOpts);

    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }

    cancelForm();
    reload();
  }

  async function handleDelete(contact: AccountContact) {
    if (!window.confirm(`Remove ${contact.fullName}?`)) return;
    setBusy(true);
    setError(null);
    const result = await deleteAccountContact(contact.id);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (editingId === contact.id) cancelForm();
    reload();
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading m-0 text-base">Contacts</h3>
        {!showForm && !sellingBlocked ? (
          <Button
            type="button"
            variant="secondary"
            className="px-3 py-1 text-xs"
            onClick={startAdd}
          >
            + Add contact
          </Button>
        ) : null}
      </div>

      {loading ? <p className="text-ink/60 m-0 text-sm">Loading contacts…</p> : null}
      {error ? (
        <p className="text-accent-800 m-0 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && contacts.length === 0 && !showForm ? (
        <p className="text-ink/60 m-0 text-sm">
          {sellingBlocked
            ? 'No line contacts on this account.'
            : 'No contacts yet. Add a buyer, manager, or owner.'}
        </p>
      ) : null}

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {contacts.map((contact) => (
          <li key={contact.id} className="border-ink/10 rounded-md border px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Tag variant={contact.role === 'owner' ? 'accent' : 'neutral'}>
                {accountContactRoleLabel(contact.role)}
              </Tag>
              {contact.isPrimary ? <Tag variant="accent-2">Primary</Tag> : null}
              <span className="font-semibold">{contact.fullName}</span>
            </div>
            {contact.title ? <p className="text-ink/70 m-0 mt-1 text-xs">{contact.title}</p> : null}
            <dl className="m-0 mt-2 grid gap-1 text-xs">
              <div className="flex gap-2">
                <dt className="text-ink/55 m-0 shrink-0">Phone</dt>
                <dd className="m-0">{contact.phone || '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-ink/55 m-0 shrink-0">Email</dt>
                <dd className="m-0 break-all">{contact.email || '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-ink/55 m-0 shrink-0">Alternate email</dt>
                <dd className="m-0 break-all">{contact.alternateEmail || '—'}</dd>
              </div>
            </dl>
            <div className="mt-2 flex gap-2">
              {sellingBlocked ? null : (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    className="px-2 py-0.5 text-xs"
                    disabled={busy}
                    onClick={() => startEdit(contact)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="px-2 py-0.5 text-xs"
                    disabled={busy}
                    onClick={() => void handleDelete(contact)}
                  >
                    Delete
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {showForm && !sellingBlocked ? (
        <form
          className="border-ink/15 flex flex-col gap-2 rounded-md border p-3"
          onSubmit={(e) => void handleSubmit(e)}
        >
          <p className="font-heading m-0 text-sm">{editingId ? 'Edit contact' : 'New contact'}</p>
          <Field>
            <FieldLabel>Role</FieldLabel>
            <Select
              value={form.role}
              onChange={(e) =>
                setForm((f) => ({ ...f, role: e.target.value as AccountContactRole }))
              }
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
              placeholder="e.g. GM / Softgoods buyer"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field>
              <FieldLabel>Phone</FieldLabel>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                disabled={busy}
              />
            </Field>
            <Field>
              <FieldLabel>Email</FieldLabel>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                disabled={busy}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel>Alternate email</FieldLabel>
            <Input
              type="email"
              value={form.alternateEmail}
              onChange={(e) => setForm((f) => ({ ...f, alternateEmail: e.target.value }))}
              disabled={busy}
            />
          </Field>
          <Field>
            <FieldLabel>Notes</FieldLabel>
            <MentionTextarea
              rows={2}
              placeholder="Use # for products, @ for contacts"
              value={form.notes}
              onChange={(value) => setForm((f) => ({ ...f, notes: value }))}
              accountId={accountId}
              disabled={busy}
            />
          </Field>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isPrimary}
              onChange={(e) => setForm((f) => ({ ...f, isPrimary: e.target.checked }))}
              disabled={busy}
            />
            Primary contact
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={cancelForm} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Saving…' : editingId ? 'Save changes' : 'Add contact'}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
