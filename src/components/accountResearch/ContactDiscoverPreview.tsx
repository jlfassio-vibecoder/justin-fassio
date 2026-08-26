import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, FieldLabel, Input, Select } from '@/components/ui/Input';
import {
  ACCOUNT_CONTACT_ROLES,
  accountContactRoleLabel,
  type AccountContact,
  type AccountContactDuplicateMatch,
} from '@/lib/accountContacts';
import type { ContactEnrichPreview } from '@/lib/createEnrichedContact';
import { applyContactEnrich, previewContactEnrich } from '@/lib/enrichContactPreview';
import { useOptionalLineContext } from '@/lib/lineContext';
import { staffAiPostFields } from '@/lib/staffAiClientContext';
import type { AccountContactRole } from '@/types/database';

export type ContactDiscoverPreviewProps = {
  accountId: number;
  resolvedWebsite?: string | null;
  onContactAdded?: (contact: AccountContact) => void;
};

type ProposedForm = {
  fullName: string;
  title: string;
  phone: string;
  email: string;
  role: AccountContactRole;
};

/** Keep duplicate UX in sync with edited form values, not stale preview fields. */
function activeDuplicateMatch(
  preview: ContactEnrichPreview | null,
  form: ProposedForm | null,
): AccountContactDuplicateMatch | null {
  if (!preview?.duplicate || !form) return null;
  const dup = preview.duplicate;
  if (dup.kind === 'email') {
    const email = form.email.trim();
    const dupEmail = dup.contact.email?.trim() ?? '';
    if (!email || email.toLowerCase() !== dupEmail.toLowerCase()) return null;
    return dup;
  }
  const fullName = form.fullName.trim();
  if (!fullName || fullName !== preview.proposed.fullName.trim()) return null;
  return dup;
}

export function ContactDiscoverPreview({
  accountId,
  resolvedWebsite,
  onContactAdded,
}: ContactDiscoverPreviewProps) {
  const line = useOptionalLineContext();
  const [candidateName, setCandidateName] = useState('');
  const [preview, setPreview] = useState<ContactEnrichPreview | null>(null);
  const [form, setForm] = useState<ProposedForm | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [busyPreview, setBusyPreview] = useState(false);
  const [busyApply, setBusyApply] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDuplicateEmail, setConfirmDuplicateEmail] = useState(false);
  const [allowNameDuplicate, setAllowNameDuplicate] = useState(false);

  const duplicate = useMemo(() => activeDuplicateMatch(preview, form), [preview, form]);
  const emailBlocked = duplicate?.kind === 'email' && !confirmDuplicateEmail;
  const nameWarning = duplicate?.kind === 'name' && !allowNameDuplicate;
  const busy = busyPreview || busyApply;

  async function handlePreview() {
    setBusyPreview(true);
    setError(null);
    setPreview(null);
    setForm(null);
    setConfirmDuplicateEmail(false);
    setAllowNameDuplicate(false);

    const aiFields = await staffAiPostFields({
      multiLineAi: line.multiLineAi,
      salesLineId: line.salesLineId,
      prospectId: accountId,
    });

    const result = await previewContactEnrich({
      accountId,
      candidateName: candidateName.trim() || undefined,
      resolvedWebsite: resolvedWebsite?.trim() || undefined,
      ...aiFields,
    });

    setBusyPreview(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setPreview(result.preview);
    setForm({
      fullName: result.preview.proposed.fullName,
      title: result.preview.proposed.title ?? '',
      phone: result.preview.proposed.phone ?? '',
      email: result.preview.proposed.email ?? '',
      role: result.preview.proposed.role,
    });
  }

  async function handleApply() {
    if (!form) return;
    const fullName = form.fullName.trim();
    if (!fullName) {
      setError('Contact name is required.');
      return;
    }
    if (emailBlocked) return;
    if (nameWarning) return;

    setBusyApply(true);
    setError(null);

    const aiFields = await staffAiPostFields({
      multiLineAi: line.multiLineAi,
      salesLineId: line.salesLineId,
      prospectId: accountId,
    });

    const result = await applyContactEnrich({
      accountId,
      fullName,
      title: form.title.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      role: form.role,
      confirmDuplicateEmail,
      ...aiFields,
    });

    setBusyApply(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setPreview(null);
    setForm(null);
    setCandidateName('');
    setConfirmDuplicateEmail(false);
    setAllowNameDuplicate(false);
    onContactAdded?.(result.contact);
  }

  return (
    <div className="border-ink/10 flex flex-col gap-3 rounded-md border px-3 py-3">
      <div>
        <p className="m-0 text-sm font-medium">Discover contact</p>
        <p className="text-ink/55 m-0 mt-1 text-xs leading-relaxed">
          Preview a purchasing contact from public sources and Yelp directory context. Nothing is
          saved until you confirm.
        </p>
      </div>

      <Field>
        <FieldLabel>Candidate name (optional)</FieldLabel>
        <Input
          value={candidateName}
          onChange={(e) => setCandidateName(e.target.value)}
          disabled={busy}
          placeholder="Leave blank to find owner / buyer / GM"
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => void handlePreview()}>
          {busyPreview ? 'Researching…' : 'Preview'}
        </Button>
      </div>

      {preview?.yelpListingUrl ? (
        <p className="text-ink/60 m-0 text-xs">
          Yelp directory evidence:{' '}
          <a
            href={preview.yelpListingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-700 underline"
          >
            {preview.yelpListingUrl}
          </a>
        </p>
      ) : null}

      {preview?.researchBrief ? (
        <div className="border-ink/10 rounded-md border">
          <button
            type="button"
            className="text-ink/70 flex w-full items-center gap-1.5 px-2.5 py-2 text-left text-xs font-semibold tracking-wider uppercase"
            onClick={() => setBriefOpen((open) => !open)}
          >
            {briefOpen ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            Research brief
          </button>
          {briefOpen ? (
            <p className="text-ink/75 m-0 max-h-48 overflow-y-auto px-2.5 pb-2 text-xs leading-relaxed whitespace-pre-wrap">
              {preview.researchBrief}
            </p>
          ) : null}
        </div>
      ) : null}

      {duplicate?.kind === 'email' ? (
        <div className="bg-bg/80 flex flex-col gap-2 rounded-md px-2.5 py-2 text-sm" role="status">
          <p className="text-ink m-0">
            A contact with this email already exists:{' '}
            <span className="font-semibold">{duplicate.contact.fullName}</span>
            {duplicate.contact.email ? ` (${duplicate.contact.email})` : ''}.
          </p>
          <label className="text-ink inline-flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={confirmDuplicateEmail}
              onChange={(e) => setConfirmDuplicateEmail(e.target.checked)}
              disabled={busy}
            />
            Add anyway (acknowledge duplicate email)
          </label>
        </div>
      ) : null}

      {duplicate?.kind === 'name' && !allowNameDuplicate ? (
        <div className="bg-bg/80 flex flex-col gap-2 rounded-md px-2.5 py-2 text-sm" role="status">
          <p className="text-ink m-0">
            A contact with a similar name already exists:{' '}
            <span className="font-semibold">{duplicate.contact.fullName}</span>
            {duplicate.contact.email ? ` (${duplicate.contact.email})` : ''}.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="self-start px-3 py-1 text-xs"
            disabled={busy}
            onClick={() => setAllowNameDuplicate(true)}
          >
            Add new contact anyway
          </Button>
        </div>
      ) : null}

      {form ? (
        <div className="flex flex-col gap-2">
          <Field>
            <FieldLabel>Role</FieldLabel>
            <Select
              value={form.role}
              onChange={(e) =>
                setForm((current) =>
                  current ? { ...current, role: e.target.value as AccountContactRole } : current,
                )
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
              value={form.fullName}
              onChange={(e) => {
                setAllowNameDuplicate(false);
                setForm((current) =>
                  current ? { ...current, fullName: e.target.value } : current,
                );
              }}
              disabled={busy}
            />
          </Field>
          <Field>
            <FieldLabel>Title</FieldLabel>
            <Input
              value={form.title}
              onChange={(e) =>
                setForm((current) => (current ? { ...current, title: e.target.value } : current))
              }
              disabled={busy}
              placeholder="Optional"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field>
              <FieldLabel>Email</FieldLabel>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => {
                  setConfirmDuplicateEmail(false);
                  setForm((current) => (current ? { ...current, email: e.target.value } : current));
                }}
                disabled={busy}
              />
            </Field>
            <Field>
              <FieldLabel>Phone</FieldLabel>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) =>
                  setForm((current) => (current ? { ...current, phone: e.target.value } : current))
                }
                disabled={busy}
              />
            </Field>
          </div>
          {preview?.proposed.isPrimary ? (
            <p className="text-ink/55 m-0 text-xs">
              Will be set as primary (first contact on account).
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="text-accent-800 m-0 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {form ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={busy || emailBlocked || nameWarning || !form.fullName.trim()}
            onClick={() => void handleApply()}
          >
            {busyApply ? 'Adding…' : 'Add contact'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
