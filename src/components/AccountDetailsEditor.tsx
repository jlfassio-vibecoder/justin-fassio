import { useId, useMemo, useState, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { CopyableUrl, CopyUrlButton } from '@/components/ui/CopyUrlButton';
import { Field, FieldLabel, Input, Select } from '@/components/ui/Input';
import { useOptionalLineContext } from '@/lib/lineContext';
import {
  allowedOpsCodesForStore,
  fetchOperationalTerritories,
  isCanadianStoreCode,
  suggestOperationalTerritoryForAccount,
  type OperationalTerritoryOption,
} from '@/lib/operationalTerritories';
import { formatAccountDetailsClipboard } from '@/lib/formatAccountDetailsClipboard';
import type { Prospect } from '@/lib/prospects';
import { fetchOperationalLineAccount } from '@/lib/retailerLineAccounts';
import {
  fetchStoreTerritories,
  suggestTerritoryCodeFromRegion,
  type Territory,
} from '@/lib/territories';
import { regionSuggestionsForTerritory } from '@/lib/geoCatalog';
import {
  draftFromProspect,
  shouldConfirmProtectedIdentityEdit,
  updateProspectAccountDetails,
  validateAccountDetailsDraft,
  type AccountDetailsDraft,
} from '@/lib/updateProspectAccountDetails';

type Props = {
  prospect: Prospect;
  onSaved: (prospect: Prospect) => void;
  disabled?: boolean;
};

function displayValue(value: string | null | undefined): string {
  const t = (value ?? '').trim();
  return t.length > 0 ? t : '—';
}

export function AccountDetailsEditor({ prospect, onSaved, disabled = false }: Props) {
  const line = useOptionalLineContext();
  const regionListId = useId();
  const [draft, setDraft] = useState<AccountDetailsDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditWarning, setAuditWarning] = useState<string | null>(null);
  const [storeTerritories, setStoreTerritories] = useState<Territory[]>([]);
  const [opsTerritories, setOpsTerritories] = useState<OperationalTerritoryOption[]>([]);

  const editing = draft != null;

  async function startEdit() {
    setDraft(draftFromProspect(prospect));
    setError(null);
    const loads: Promise<void>[] = [];
    if (storeTerritories.length === 0) {
      loads.push(
        fetchStoreTerritories().then((result) => {
          if (!result.error) setStoreTerritories(result.data);
        }),
      );
    }
    if (opsTerritories.length === 0) {
      loads.push(
        fetchOperationalTerritories().then((result) => {
          if (!result.error) setOpsTerritories(result.data);
        }),
      );
    }
    await Promise.all(loads);
  }

  function handleCancel() {
    setDraft(null);
    setError(null);
  }

  function updateField<K extends keyof AccountDetailsDraft>(key: K, value: AccountDetailsDraft[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
    setError(null);
    setAuditWarning(null);
  }

  const draftTerritoryCode =
    draft != null
      ? (storeTerritories.find((t) => t.id === draft.territoryId)?.code ??
        (draft.territoryId === prospect.territoryId ? prospect.territoryCode : null))
      : null;

  const regionSuggestions = useMemo(
    () => regionSuggestionsForTerritory(draftTerritoryCode ?? prospect.territoryCode),
    [draftTerritoryCode, prospect.territoryCode],
  );

  const suggestedCode = draft ? suggestTerritoryCodeFromRegion(draft.region) : null;
  const suggestedTerritory =
    suggestedCode != null ? storeTerritories.find((t) => t.code === suggestedCode) : undefined;
  const showTerritorySuggestion =
    editing &&
    suggestedTerritory != null &&
    suggestedCode != null &&
    suggestedCode !== draftTerritoryCode;

  const selectedCountry =
    draft != null
      ? (storeTerritories.find((t) => t.id === draft.territoryId)?.countryCode ?? null)
      : null;

  const canadianStore = isCanadianStoreCode(draftTerritoryCode ?? prospect.territoryCode);
  const allowedOpsCodes = allowedOpsCodesForStore(draftTerritoryCode ?? prospect.territoryCode);
  const assignableOps = useMemo(
    () => opsTerritories.filter((t) => (allowedOpsCodes as readonly string[]).includes(t.code)),
    [opsTerritories, allowedOpsCodes],
  );

  const opsSuggestion = useMemo(() => {
    if (!draft || canadianStore) return null;
    return suggestOperationalTerritoryForAccount({
      postalCode: draft.postalCode,
      address: draft.address,
      storeTerritoryCode: draftTerritoryCode,
    });
  }, [draft, canadianStore, draftTerritoryCode]);

  const suggestedOpsOption =
    opsSuggestion?.ok === true
      ? assignableOps.find((t) => t.code === opsSuggestion.territoryCode)
      : undefined;
  const showOpsSuggestion =
    editing &&
    !canadianStore &&
    suggestedOpsOption != null &&
    suggestedOpsOption.id !== (draft?.operationalTerritoryId ?? null);

  const validationError = draft
    ? validateAccountDetailsDraft(draft, { countryCode: selectedCountry })
    : null;
  const isDirty =
    draft != null &&
    (Object.keys(draft) as (keyof AccountDetailsDraft)[]).some(
      (key) => draft[key] !== draftFromProspect(prospect)[key],
    );
  const canSave = editing && isDirty && validationError == null && !busy && !disabled;

  function applySuggestedStoreTerritory() {
    if (!suggestedTerritory) return;
    updateField('territoryId', suggestedTerritory.id);
  }

  function applySuggestedOpsTerritory() {
    if (!suggestedOpsOption) return;
    updateField('operationalTerritoryId', suggestedOpsOption.id);
  }

  function clearOpsTerritory() {
    updateField('operationalTerritoryId', null);
  }

  async function handleSave(e: SubmitEvent) {
    e.preventDefault();
    if (!draft || !canSave) return;

    if (validationError) {
      setError(validationError);
      return;
    }

    if (shouldConfirmProtectedIdentityEdit(prospect, draft)) {
      const ok = window.confirm(
        'This account has verified or import-protected identity fields. Save your changes anyway?',
      );
      if (!ok) return;
    }

    setBusy(true);
    setError(null);
    setAuditWarning(null);

    let retailerLineAccountId: string | null = null;
    if (line.salesLineId) {
      const rla = await fetchOperationalLineAccount({
        retailerId: prospect.id,
        salesLineId: line.salesLineId,
      });
      retailerLineAccountId = rla.data?.id ?? null;
    }

    const result = await updateProspectAccountDetails(prospect, draft, {
      salesLineId: line.salesLineId,
      retailerLineAccountId,
      countryCode: selectedCountry,
      storeTerritoryCode: draftTerritoryCode,
      operationalTerritories: opsTerritories,
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setDraft(null);
    if (result.auditWarning) setAuditWarning(result.auditWarning);
    onSaved(result.data);
  }

  if (!editing) {
    const accountDetailsClipboard = formatAccountDetailsClipboard(prospect);
    return (
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-heading m-0 text-base">Account details</h3>
          <div className="flex items-center gap-2">
            <CopyUrlButton url={accountDetailsClipboard} label="Copy account details" />
            <Button type="button" variant="secondary" disabled={disabled} onClick={startEdit}>
              Edit
            </Button>
          </div>
        </div>
        <dl className="m-0 grid gap-3 text-sm">
          <div>
            <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">Business name</dt>
            <dd className="m-0 mt-0.5">
              {prospect.name?.trim() ? (
                <span className="inline-flex max-w-full items-start gap-1">
                  <span className="min-w-0">{prospect.name}</span>
                  <CopyUrlButton url={prospect.name} label="Copy name" className="mt-0.5" />
                </span>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">Store phone</dt>
            <dd className="m-0 mt-0.5">{displayValue(prospect.phone)}</dd>
          </div>
          <div>
            <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">Website</dt>
            <dd className="m-0 mt-0.5">
              {prospect.website?.trim() ? (
                <CopyableUrl url={prospect.website} linkClassName="text-accent-800 text-sm" />
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">Street address</dt>
            <dd className="m-0 mt-0.5">{displayValue(prospect.address)}</dd>
          </div>
          <div>
            <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">City</dt>
            <dd className="m-0 mt-0.5">{displayValue(prospect.city)}</dd>
          </div>
          <div>
            <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">Region</dt>
            <dd className="m-0 mt-0.5">{displayValue(prospect.region)}</dd>
          </div>
          <div>
            <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">
              Store territory
            </dt>
            <dd className="m-0 mt-0.5">{displayValue(prospect.territoryName)}</dd>
          </div>
          <div>
            <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">
              Operational territory
            </dt>
            <dd className="m-0 mt-0.5">
              {displayValue(prospect.operationalTerritoryName ?? null)}
            </dd>
          </div>
          <div>
            <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">Postal / ZIP</dt>
            <dd className="m-0 mt-0.5">{displayValue(prospect.postalCode)}</dd>
          </div>
          <div>
            <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">
              Fit / business description
            </dt>
            <dd className="text-ink/80 m-0 mt-0.5 leading-relaxed">{displayValue(prospect.fit)}</dd>
          </div>
        </dl>
        {auditWarning ? (
          <p className="text-ink/70 m-0 text-xs" role="status">
            {auditWarning}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSave}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading m-0 text-base">Account details</h3>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!canSave}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <Field>
        <FieldLabel>Business name</FieldLabel>
        <Input
          value={draft.name}
          onChange={(e) => updateField('name', e.target.value)}
          required
          disabled={busy}
        />
      </Field>
      <Field>
        <FieldLabel>Store phone</FieldLabel>
        <Input
          value={draft.phone}
          onChange={(e) => updateField('phone', e.target.value)}
          disabled={busy}
        />
      </Field>
      <Field>
        <FieldLabel>Website</FieldLabel>
        <Input
          value={draft.website}
          onChange={(e) => updateField('website', e.target.value)}
          placeholder="https://"
          disabled={busy}
        />
      </Field>
      <Field>
        <FieldLabel>Street address</FieldLabel>
        <Input
          value={draft.address}
          onChange={(e) => updateField('address', e.target.value)}
          disabled={busy}
        />
      </Field>
      <Field>
        <FieldLabel>City</FieldLabel>
        <Input
          value={draft.city}
          onChange={(e) => updateField('city', e.target.value)}
          required
          disabled={busy}
        />
      </Field>
      <Field>
        <FieldLabel>Region</FieldLabel>
        <Input
          value={draft.region}
          onChange={(e) => updateField('region', e.target.value)}
          list={regionListId}
          required
          disabled={busy}
        />
        <datalist id={regionListId}>
          {regionSuggestions.map((opt) => (
            <option key={opt} value={opt} />
          ))}
        </datalist>
      </Field>
      <Field>
        <FieldLabel>Store territory</FieldLabel>
        <Select
          value={draft.territoryId}
          onChange={(e) => updateField('territoryId', e.target.value)}
          required
          disabled={busy || storeTerritories.length === 0}
          aria-label="Store territory"
        >
          {storeTerritories.length === 0 ? (
            <option value={draft.territoryId}>
              {prospect.territoryName ?? 'Loading territories…'}
            </option>
          ) : (
            storeTerritories.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))
          )}
        </Select>
      </Field>

      {showTerritorySuggestion ? (
        <div className="flex flex-col gap-2" role="status">
          <p className="text-ink/70 m-0 text-xs">
            Region suggests store territory {suggestedTerritory.name}. City and Region are not
            changed automatically.
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={applySuggestedStoreTerritory}
          >
            Apply suggested store territory
          </Button>
        </div>
      ) : null}

      <Field>
        <FieldLabel>Operational territory</FieldLabel>
        {canadianStore ? (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-sm" aria-label="Operational territory">
              {draft.operationalTerritoryId
                ? (opsTerritories.find((t) => t.id === draft.operationalTerritoryId)?.name ??
                  prospect.operationalTerritoryName ??
                  'Assigned')
                : 'Not assigned'}
            </p>
            {draft.operationalTerritoryId ? (
              <Button type="button" variant="secondary" disabled={busy} onClick={clearOpsTerritory}>
                Clear operational territory
              </Button>
            ) : (
              <p className="text-ink/55 m-0 text-xs">
                Operational territories apply to US West Coast store geos only.
              </p>
            )}
          </div>
        ) : (
          <Select
            value={draft.operationalTerritoryId ?? ''}
            onChange={(e) =>
              updateField('operationalTerritoryId', e.target.value ? e.target.value : null)
            }
            disabled={busy}
            aria-label="Operational territory"
          >
            <option value="">Not assigned</option>
            {assignableOps.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            {draft.operationalTerritoryId &&
            !assignableOps.some((t) => t.id === draft.operationalTerritoryId) ? (
              <option value={draft.operationalTerritoryId}>
                {opsTerritories.find((t) => t.id === draft.operationalTerritoryId)?.name ??
                  prospect.operationalTerritoryName ??
                  'Current assignment'}
              </option>
            ) : null}
          </Select>
        )}
      </Field>

      {showOpsSuggestion ? (
        <div className="flex flex-col gap-2" role="status">
          <p className="text-ink/70 m-0 text-xs">
            ZIP/county suggests operational territory {suggestedOpsOption.name}. Store territory is
            not changed automatically.
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={applySuggestedOpsTerritory}
          >
            Apply suggested operational territory
          </Button>
        </div>
      ) : null}

      {!canadianStore && opsSuggestion && !opsSuggestion.ok && draft.postalCode.trim() === '' ? (
        <p className="text-ink/55 m-0 text-xs" role="status">
          Add a ZIP to suggest an operational territory.
        </p>
      ) : null}

      <Field>
        <FieldLabel>Postal / ZIP</FieldLabel>
        <Input
          value={draft.postalCode}
          onChange={(e) => updateField('postalCode', e.target.value)}
          disabled={busy}
        />
      </Field>
      <Field>
        <FieldLabel>Fit / business description</FieldLabel>
        <Input
          value={draft.fit}
          onChange={(e) => updateField('fit', e.target.value)}
          disabled={busy}
        />
      </Field>

      {error ? (
        <p className="text-accent-800 m-0 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
