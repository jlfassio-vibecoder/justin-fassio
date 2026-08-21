// Copilot suggestion ignored: React 19 types export SubmitEvent; FormEvent is deprecated for form onSubmit.
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { X } from 'lucide-react';
import { ConvertAccountModal } from '@/components/ConvertAccountModal';
import { AddAccountContactInline } from '@/components/AddAccountContactInline';
import { MentionTextarea } from '@/components/MentionTextarea';
import { Button } from '@/components/ui/Button';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import { Field, FieldLabel, Input, Select } from '@/components/ui/Input';
import { useAiAssist } from '@/hooks/useAiAssist';
import { buildCallDraft } from '@/lib/aiAssistPrefill';
import type { CatalogItem } from '@/lib/catalog';
import { PRIMARY_RETAIL_CHANNELS } from '@/lib/crmRetailTaxonomy';
import { isConversionOutcome } from '@/lib/convertToActiveAccount';
import { fetchContactsForAccount, type AccountContact } from '@/lib/accountContacts';
import { useOptionalLineContext } from '@/lib/lineContext';
import { loadLandedRatesPersistence } from '@/lib/landedRatesStorage';
import {
  defaultOutcomeForMode,
  feedbackTagsForMode,
  isFollowUpScheduledOutcome,
  logCallStoreLabel,
  logCallTitle,
  outcomesForMode,
  type LogCallMode,
} from '@/lib/logCallCatalogs';
import {
  buildLogCallInsert,
  formatCallContactName,
  updateProspectRetailChannel,
} from '@/lib/logCallForm';
import {
  fetchContactActivityHistory,
  type ContactActivityItem,
} from '@/lib/contactActivityHistory';
import type { Prospect } from '@/lib/prospects';
import { isStaffSellingUiBlocked } from '@/lib/retailerLineAccounts';
import { formatLocalIsoDate } from '@/lib/reorderCadence';
import { buildUsdToCadCallOrderValue } from '@/lib/calls';
import { supabase } from '@/lib/supabase';

export interface LogCallFormModalProps {
  open: boolean;
  mode: LogCallMode;
  prospects: Prospect[];
  storeId: number | null;
  catalog?: CatalogItem[];
  onClose: () => void;
  onStoreChange: (id: number | null) => void;
  onSaved?: () => void;
  onConverted?: () => void;
  /** Fired when retailer retail channel was updated so directory can refresh. */
  onRetailerUpdated?: () => void;
  /** Fired after a new CRM contact is created from Log Call (bump contacts reload). */
  onContactCreated?: () => void;
  /** Bump after a product email send so open Log Call refetches activity. */
  activityHistoryReloadToken?: number;
}

type SaveSuccessState = {
  chips: {
    prospectId: number;
    prospectName?: string;
    outcome: string;
    objectionTags?: string[];
  };
};

function formatActivityWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function clearEditableFields(setters: {
  setFeedback: (v: string[]) => void;
  setContactName: (v: string) => void;
  setSelectedContactId: (v: string) => void;
  setOutcome: (v: string) => void;
  setPmfScore: (v: string) => void;
  setOrderValue: (v: string) => void;
  setNotes: (v: string) => void;
  setFollowUpDate: (v: string) => void;
  setError: (v: string | null) => void;
  setSaveSuccess: (v: SaveSuccessState | null) => void;
  mode: LogCallMode;
}) {
  setters.setFeedback([]);
  setters.setContactName('');
  setters.setSelectedContactId('');
  setters.setOutcome(defaultOutcomeForMode(setters.mode));
  setters.setPmfScore('10');
  setters.setOrderValue('');
  setters.setNotes('');
  setters.setFollowUpDate('');
  setters.setError(null);
  setters.setSaveSuccess(null);
}

export function LogCallFormModal({
  open,
  mode,
  prospects,
  storeId,
  catalog,
  onClose,
  onStoreChange,
  onSaved,
  onConverted,
  onRetailerUpdated,
  onContactCreated,
  activityHistoryReloadToken = 0,
}: LogCallFormModalProps) {
  const { openAssist } = useAiAssist();
  const [feedback, setFeedback] = useState<string[]>([]);
  const [contactName, setContactName] = useState('');
  const [selectedContactId, setSelectedContactId] = useState('');
  const [contacts, setContacts] = useState<AccountContact[]>([]);
  const [contactsReady, setContactsReady] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [outcome, setOutcome] = useState<string>(() => defaultOutcomeForMode(mode));
  const [pmfScore, setPmfScore] = useState('10');
  const [orderValue, setOrderValue] = useState('');
  const [ogrCurrency, setOgrCurrency] = useState<'USD' | 'CAD'>('USD');
  const [exchangeRate, setExchangeRate] = useState(() => String(loadLandedRatesPersistence().fx));
  const [callDate, setCallDate] = useState(() => formatLocalIsoDate(new Date()));
  const [exchangeRateDate, setExchangeRateDate] = useState(() => formatLocalIsoDate(new Date()));
  const [followUpDate, setFollowUpDate] = useState('');
  const [notes, setNotes] = useState('');
  const selected = storeId != null ? prospects.find((p) => p.id === storeId) : undefined;
  const selectedCategory = selected?.category ?? '';
  const [retailChannel, setRetailChannel] = useState(selectedCategory);
  const [channelStoreId, setChannelStoreId] = useState(storeId);
  const [channelOpen, setChannelOpen] = useState(open);
  const [syncedCategory, setSyncedCategory] = useState(selectedCategory);
  const [activityItems, setActivityItems] = useState<ContactActivityItem[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<SaveSuccessState | null>(null);
  const submitGenRef = useRef(0);
  const closedDuringSubmitRef = useRef(false);
  const [convertProspect, setConvertProspect] = useState<Prospect | null>(null);
  const [convertPrefillCad, setConvertPrefillCad] = useState<number | null>(null);
  const [convertPrefillUsd, setConvertPrefillUsd] = useState<number | null>(null);
  const [convertPrefillExchangeRate, setConvertPrefillExchangeRate] = useState<number | null>(null);
  const [convertPrefillExchangeRateDate, setConvertPrefillExchangeRateDate] = useState<
    string | null
  >(null);
  const line = useOptionalLineContext();
  const [activityLineId, setActivityLineId] = useState(line.salesLineId);
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

  const modalCity = selected ? `${selected.city} (${selected.region})` : '';
  const showLogForm = open && convertProspect == null;
  const showConvert = convertProspect != null;
  const isOgrCall = !line.lineSlug || line.lineSlug === 'ogr';
  const usesUsdFx = isOgrCall && ogrCurrency === 'USD';
  const outcomeOptions = outcomesForMode(mode);
  const feedbackOptions = feedbackTagsForMode(mode);
  const showFollowUpDate = isFollowUpScheduledOutcome(outcome);
  const usdPreview =
    usesUsdFx && orderValue !== ''
      ? buildUsdToCadCallOrderValue({
          originalAmountUsd: orderValue,
          exchangeRate,
          exchangeRateDate,
        })
      : null;
  const usdPreviewCad = usdPreview?.ok ? usdPreview.stamp.order_value_cad.toFixed(2) : null;

  // Copilot suggestion ignored: useEffect setState fails react-hooks/set-state-in-effect; render-time prop sync is the React-supported pattern.
  if (storeId !== channelStoreId) {
    setChannelStoreId(storeId);
    setRetailChannel(selectedCategory);
    setSyncedCategory(selectedCategory);
    setContacts([]);
    setContactsReady(false);
    setActivityItems([]);
    setHistoryError(null);
    setSelectedContactId('');
    setContactName('');
    setShowAddContact(false);
    setFeedback([]);
    setOutcome(defaultOutcomeForMode(mode));
    setSaveSuccess(null);
    setError(null);
  }
  if (line.salesLineId !== activityLineId) {
    setActivityLineId(line.salesLineId);
    setActivityItems([]);
    setHistoryError(null);
  }
  if (open !== channelOpen) {
    setChannelOpen(open);
    if (open) {
      setRetailChannel(selectedCategory);
      setSyncedCategory(selectedCategory);
      setContactsReady(false);
    } else {
      setContactsReady(false);
      setShowAddContact(false);
    }
  }
  if (open && selectedCategory !== syncedCategory) {
    setSyncedCategory(selectedCategory);
    setRetailChannel(selectedCategory);
  }

  useEffect(() => {
    if (!open || storeId == null) return;

    let active = true;
    void (async () => {
      const [contactsResult, historyResult] = await Promise.all([
        fetchContactsForAccount(storeId),
        fetchContactActivityHistory({ prospectId: storeId, salesLineId: line.salesLineId }),
      ]);
      if (!active) return;
      setContacts(contactsResult.data);
      setContactsReady(true);
      const primary = contactsResult.data.find((c) => c.isPrimary) ?? contactsResult.data[0];
      if (primary) {
        setSelectedContactId(primary.id);
        setContactName(formatCallContactName(primary));
      }
      setActivityItems(historyResult.data);
      setHistoryError(historyResult.error);
    })();

    return () => {
      active = false;
    };
  }, [open, storeId, line.salesLineId, activityHistoryReloadToken]);

  function toggleFeedback(option: string) {
    setFeedback((prev) =>
      prev.includes(option) ? prev.filter((f) => f !== option) : [...prev, option],
    );
  }

  function clearForm() {
    clearEditableFields({
      setFeedback,
      setContactName,
      setSelectedContactId,
      setOutcome,
      setPmfScore,
      setOrderValue,
      setNotes,
      setFollowUpDate,
      setError,
      setSaveSuccess,
      mode,
    });
    setCallDate(formatLocalIsoDate(new Date()));
    setExchangeRateDate(formatLocalIsoDate(new Date()));
  }

  function handleClose() {
    closedDuringSubmitRef.current = true;
    submitGenRef.current += 1;
    setBusy(false);
    clearForm();
    setConvertProspect(null);
    setConvertPrefillCad(null);
    setConvertPrefillUsd(null);
    setConvertPrefillExchangeRate(null);
    setConvertPrefillExchangeRateDate(null);
    onClose();
  }

  async function refreshActivityHistory(prospectId: number) {
    const salesLineId = line.salesLineId;
    const result = await fetchContactActivityHistory({
      prospectId,
      salesLineId,
    });
    // Ignore stale responses after store/line context changed.
    if (storeId !== prospectId || line.salesLineId !== salesLineId) return;
    setActivityItems(result.data);
    setHistoryError(result.error);
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaveSuccess(null);

    if (storeId == null) {
      setError(`Select ${mode === 'account' ? 'an account' : 'a store prospect'}.`);
      return;
    }

    const trimmedContact = contactName.trim();
    if (!trimmedContact) {
      setError('Contact name is required.');
      return;
    }

    if (showFollowUpDate && !followUpDate.trim()) {
      setError('Follow-up date is required when outcome is Follow-up Scheduled.');
      return;
    }

    const submitGen = ++submitGenRef.current;
    closedDuringSubmitRef.current = false;
    setBusy(true);

    const built = await buildLogCallInsert({
      prospectId: storeId,
      contactName: trimmedContact,
      outcome,
      pmfScore: mode === 'prospect' ? Number(pmfScore) : null,
      objectionTags: feedback,
      notes: notes.trim() || null,
      callDate,
      followUpDate: showFollowUpDate ? followUpDate.trim() || null : null,
      orderValue,
      isOgrCall,
      ogrCurrency,
      exchangeRate,
      exchangeRateDate,
      salesLineId: line.salesLineId,
      eaglePeakSellingEnabled: line.eaglePeakSelling,
      bigFishSellingEnabled: line.bigFishSelling,
    });

    if (closedDuringSubmitRef.current || submitGen !== submitGenRef.current) return;

    if (!built.ok) {
      setBusy(false);
      setError(built.error);
      return;
    }

    const initialCategory = selected?.category ?? '';
    if (retailChannel && retailChannel !== initialCategory) {
      const channelUpdate = await updateProspectRetailChannel(storeId, retailChannel);
      if (closedDuringSubmitRef.current || submitGen !== submitGenRef.current) return;
      if (channelUpdate.error) {
        setBusy(false);
        setError(channelUpdate.error);
        return;
      }
      onRetailerUpdated?.();
    }

    if (closedDuringSubmitRef.current || submitGen !== submitGenRef.current) return;

    const { error: insertError } = await supabase.from('calls').insert(built.row);
    if (closedDuringSubmitRef.current || submitGen !== submitGenRef.current) return;

    if (insertError) {
      setBusy(false);
      setError(insertError.message);
      return;
    }

    onSaved?.();
    await refreshActivityHistory(storeId);
    if (closedDuringSubmitRef.current || submitGen !== submitGenRef.current) return;

    const chips = {
      prospectId: storeId,
      prospectName: selected?.name,
      outcome,
      objectionTags: feedback.length > 0 ? feedback : undefined,
    };

    const shouldPromptConvert =
      mode === 'prospect' &&
      isConversionOutcome(outcome) &&
      selected != null &&
      selected.accountStatus !== 'active_account' &&
      selected.accountStatus !== 'inactive';

    if (shouldPromptConvert) {
      clearEditableFields({
        setFeedback,
        setContactName,
        setSelectedContactId,
        setOutcome,
        setPmfScore,
        setOrderValue,
        setNotes,
        setFollowUpDate,
        setError,
        setSaveSuccess,
        mode,
      });
      setConvertPrefillCad(
        built.convertPrefillCad != null && built.convertPrefillCad > 0
          ? built.convertPrefillCad
          : null,
      );
      setConvertPrefillUsd(built.convertPrefillUsd);
      setConvertPrefillExchangeRate(built.convertPrefillExchangeRate);
      setConvertPrefillExchangeRateDate(built.convertPrefillExchangeRateDate);
      setConvertProspect(selected);
      setBusy(false);
      return;
    }

    setFeedback([]);
    setNotes('');
    setOrderValue('');
    setFollowUpDate('');
    setOutcome(defaultOutcomeForMode(mode));
    setSaveSuccess({ chips });
    setBusy(false);
  }

  function handleDraftFollowUp() {
    if (!saveSuccess) return;
    openAssist({
      chips: saveSuccess.chips,
      draft: buildCallDraft(saveSuccess.chips, 'script', {
        multiLineAi: line.multiLineAi,
        lineName: line.name,
      }),
    });
  }

  if (!open && !showConvert) return null;

  if (showLogForm && line.multiLineWrites && sellingBlocked) {
    return (
      <DialogBackdrop open onClose={handleClose}>
        <div className="gap-3.1 bg-surface p-4.1 flex max-w-[560px] flex-col rounded-xl shadow-lg">
          <div className="flex items-center justify-between">
            <DialogTitle>{logCallTitle(mode)}</DialogTitle>
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-transparent"
              aria-label="Close"
            >
              <X size={18} strokeWidth={2.75} />
            </button>
          </div>
          <p className="text-ink/75 m-0 text-sm">
            Selling for this line is not enabled yet. Call logging stays on Old Guys Rule.
          </p>
        </div>
      </DialogBackdrop>
    );
  }

  return (
    <>
      {showLogForm ? (
        <DialogBackdrop open={showLogForm} onClose={handleClose}>
          <form
            className="gap-3.1 bg-surface p-4.1 flex max-h-[90vh] max-w-[560px] flex-col overflow-y-auto rounded-xl shadow-lg"
            onSubmit={(e) => void handleSubmit(e)}
          >
            <div className="flex items-center justify-between">
              <DialogTitle>{logCallTitle(mode)}</DialogTitle>
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
              <FieldLabel>{logCallStoreLabel(mode)}</FieldLabel>
              <Select
                value={storeId ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (!raw) {
                    onStoreChange(null);
                    return;
                  }
                  onStoreChange(parseInt(raw, 10));
                }}
                required
              >
                <option value="">Select {mode === 'account' ? 'an account' : 'a store'}…</option>
                {prospects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.city}
                  </option>
                ))}
              </Select>
            </Field>

            {storeId != null ? (
              <section className="border-ink/10 gap-2 border-t pt-3" aria-label="Previous activity">
                <h3 className="font-heading text-ink m-0 text-sm font-semibold">
                  Previous activity
                </h3>
                {historyError ? (
                  <p className="text-accent-800 m-0 text-sm">{historyError}</p>
                ) : activityItems.length === 0 ? (
                  <p className="text-ink/60 m-0 text-sm">No prior activity on this line.</p>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                    {activityItems.map((item) => (
                      <li
                        key={`${item.kind}-${item.id}`}
                        className="border-ink/10 bg-bg/60 rounded-lg border px-3 py-2 text-sm"
                      >
                        <div className="text-ink/80 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="border-ink/20 text-ink/70 rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                            {item.kind === 'email' ? 'Email' : 'Call'}
                          </span>
                          <span>
                            {item.kind === 'email'
                              ? formatActivityWhen(item.occurredAt)
                              : item.occurredAt}
                          </span>
                          {item.contactLabel ? <span>· {item.contactLabel}</span> : null}
                          {item.kind === 'call' && item.outcome ? (
                            <span>· {item.outcome}</span>
                          ) : null}
                          {item.kind === 'call' && item.followUpDate ? (
                            <span>· Follow-up {item.followUpDate}</span>
                          ) : null}
                          {item.kind === 'email' && item.subject ? (
                            <span>· {item.subject}</span>
                          ) : null}
                        </div>
                        {item.kind === 'email' ? (
                          <div className="text-ink/65 m-0 mt-1 flex flex-col gap-0.5 text-xs">
                            {item.productLabel ? <span>{item.productLabel}</span> : null}
                            {item.senderLabel ? <span>From {item.senderLabel}</span> : null}
                            {item.messageSummary ? (
                              <span className="text-ink/80 whitespace-pre-wrap">
                                {item.messageSummary}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        {item.kind === 'call' &&
                        item.objectionTags &&
                        item.objectionTags.length > 0 ? (
                          <p className="text-ink/65 m-0 mt-1 text-xs">
                            {item.objectionTags.join(' · ')}
                          </p>
                        ) : null}
                        {item.kind === 'call' && item.notes ? (
                          <p className="text-ink/80 m-0 mt-1 whitespace-pre-wrap">{item.notes}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Retail channel</FieldLabel>
                <Select
                  value={retailChannel}
                  onChange={(e) => setRetailChannel(e.target.value)}
                  disabled={storeId == null}
                >
                  <option value="">Select channel…</option>
                  {PRIMARY_RETAIL_CHANNELS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <FieldLabel>City / Region</FieldLabel>
                <Input readOnly value={modalCity} className="opacity-70" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <FieldLabel>Contact</FieldLabel>
                  {storeId != null && !sellingBlocked && !showAddContact && contactsReady ? (
                    <button
                      type="button"
                      className="text-accent-700 font-heading cursor-pointer border-0 bg-transparent p-0 text-xs underline"
                      onClick={() => setShowAddContact(true)}
                    >
                      Add new contact
                    </button>
                  ) : null}
                </div>
                {contacts.length > 0 ? (
                  <Select
                    value={selectedContactId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedContactId(id);
                      if (!id) {
                        setContactName('');
                        return;
                      }
                      const contact = contacts.find((c) => c.id === id);
                      if (contact) setContactName(formatCallContactName(contact));
                    }}
                  >
                    <option value="">Other / type below…</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatCallContactName(c)}
                      </option>
                    ))}
                  </Select>
                ) : null}
                <Input
                  className={contacts.length > 0 ? 'mt-2' : undefined}
                  placeholder="e.g. Dave Miller (Owner)"
                  required
                  value={contactName}
                  onChange={(e) => {
                    setContactName(e.target.value);
                    setSelectedContactId('');
                  }}
                  disabled={storeId == null}
                />
                {showAddContact && storeId != null && !sellingBlocked ? (
                  <div className="mt-2">
                    <AddAccountContactInline
                      accountId={storeId}
                      existingContacts={contacts}
                      writeOpts={{
                        writesEnabled: line.multiLineWrites,
                        salesLineId: line.salesLineId,
                      }}
                      onCancel={() => setShowAddContact(false)}
                      onSelectExisting={(contact) => {
                        setContacts((prev) =>
                          prev.some((c) => c.id === contact.id) ? prev : [...prev, contact],
                        );
                        setSelectedContactId(contact.id);
                        setContactName(formatCallContactName(contact));
                        setShowAddContact(false);
                      }}
                      onCreated={(contact) => {
                        setContacts((prev) => {
                          const without = prev.filter((c) => c.id !== contact.id);
                          return contact.isPrimary
                            ? [
                                contact,
                                ...without.map((c) =>
                                  c.isPrimary ? { ...c, isPrimary: false } : c,
                                ),
                              ]
                            : [...without, contact];
                        });
                        setSelectedContactId(contact.id);
                        setContactName(formatCallContactName(contact));
                        setShowAddContact(false);
                        onContactCreated?.();
                      }}
                    />
                  </div>
                ) : null}
              </Field>
              <Field>
                <FieldLabel>Call outcome</FieldLabel>
                <Select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  disabled={storeId == null}
                >
                  {outcomeOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Call date</FieldLabel>
                <Input
                  type="date"
                  value={callDate}
                  onChange={(e) => {
                    setCallDate(e.target.value);
                    setExchangeRateDate(e.target.value);
                  }}
                  required
                  disabled={storeId == null}
                />
              </Field>
              {showFollowUpDate ? (
                <Field>
                  <FieldLabel>Follow-up date</FieldLabel>
                  <Input
                    type="date"
                    aria-label="Follow-up date"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    required
                    disabled={storeId == null}
                  />
                </Field>
              ) : (
                <div />
              )}
            </div>

            {mode === 'prospect' ? (
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel>PMF fit score</FieldLabel>
                  <Select
                    value={pmfScore}
                    onChange={(e) => setPmfScore(e.target.value)}
                    disabled={storeId == null}
                  >
                    <option value="10">10 — Perfect fit</option>
                    <option value="8">8 — Strong fit</option>
                    <option value="6">6 — Moderate fit</option>
                    <option value="3">3 — Low fit</option>
                    <option value="1">1 — Poor fit</option>
                  </Select>
                </Field>
                {isOgrCall ? (
                  <Field>
                    <FieldLabel>Original currency</FieldLabel>
                    <Select
                      value={ogrCurrency}
                      onChange={(e) => setOgrCurrency(e.target.value as 'USD' | 'CAD')}
                      disabled={storeId == null}
                    >
                      <option value="USD">USD (default)</option>
                      <option value="CAD">CAD</option>
                    </Select>
                  </Field>
                ) : (
                  <Field>
                    <FieldLabel>Order value (CAD)</FieldLabel>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0 if no PO yet"
                      value={orderValue}
                      onChange={(e) => setOrderValue(e.target.value)}
                      disabled={storeId == null}
                    />
                  </Field>
                )}
              </div>
            ) : isOgrCall ? (
              <Field>
                <FieldLabel>Original currency</FieldLabel>
                <Select
                  value={ogrCurrency}
                  onChange={(e) => setOgrCurrency(e.target.value as 'USD' | 'CAD')}
                  disabled={storeId == null}
                >
                  <option value="USD">USD (default)</option>
                  <option value="CAD">CAD</option>
                </Select>
              </Field>
            ) : (
              <Field>
                <FieldLabel>Order value (CAD)</FieldLabel>
                <Input
                  type="number"
                  min="0"
                  placeholder="0 if no PO yet"
                  value={orderValue}
                  onChange={(e) => setOrderValue(e.target.value)}
                  disabled={storeId == null}
                />
              </Field>
            )}

            {isOgrCall ? (
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel>{usesUsdFx ? 'Order value (USD)' : 'Order value (CAD)'}</FieldLabel>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0 if no PO yet"
                    value={orderValue}
                    onChange={(e) => setOrderValue(e.target.value)}
                    disabled={storeId == null}
                  />
                </Field>
                {orderValue !== '' && usesUsdFx ? (
                  <Field>
                    <FieldLabel>USD to CAD rate</FieldLabel>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.0001"
                      placeholder="1.45"
                      value={exchangeRate}
                      onChange={(e) => setExchangeRate(e.target.value)}
                    />
                  </Field>
                ) : null}
                {orderValue !== '' && !usesUsdFx ? (
                  <Field>
                    <FieldLabel>Rate date</FieldLabel>
                    <Input
                      type="date"
                      value={exchangeRateDate}
                      onChange={(e) => setExchangeRateDate(e.target.value)}
                    />
                  </Field>
                ) : null}
              </div>
            ) : null}

            {isOgrCall && usesUsdFx && orderValue !== '' ? (
              <>
                <Field>
                  <FieldLabel>Rate date</FieldLabel>
                  <Input
                    type="date"
                    value={exchangeRateDate}
                    onChange={(e) => setExchangeRateDate(e.target.value)}
                  />
                </Field>
                {usdPreviewCad != null ? (
                  <p className="text-ink/60 m-0 text-sm">CAD reporting amount: {usdPreviewCad}</p>
                ) : null}
              </>
            ) : null}

            <Field>
              <FieldLabel>Primary buyer feedback</FieldLabel>
              <div className="mb-2 flex flex-wrap gap-2">
                {feedbackOptions.map((option) => (
                  <label
                    key={option}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-neutral-100 px-2.5 py-[3px] text-[11px] text-neutral-800"
                  >
                    <input
                      type="checkbox"
                      className="m-0"
                      checked={feedback.includes(option)}
                      onChange={() => toggleFeedback(option)}
                      disabled={storeId == null}
                    />
                    {option}
                  </label>
                ))}
              </div>
              <MentionTextarea
                rows={3}
                placeholder="Call summary, buyer reaction… Use # for products, @ for contacts"
                value={notes}
                onChange={setNotes}
                items={catalog}
                accountId={storeId}
              />
            </Field>

            {error && <p className="text-accent-800 m-0 text-sm">{error}</p>}

            {saveSuccess ? (
              <div className="border-ink/10 bg-bg/80 flex flex-col gap-2 rounded-lg border px-3 py-2.5">
                <p className="text-ink m-0 text-sm">Call saved. AI follow-up is optional.</p>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={handleDraftFollowUp}>
                    Draft follow-up with AI
                  </Button>
                  <Button type="button" variant="primary" onClick={handleClose}>
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-1.5 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={handleClose} disabled={busy}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={busy || storeId == null}>
                  {busy ? 'Saving…' : 'Save Call Record'}
                </Button>
              </div>
            )}
          </form>
        </DialogBackdrop>
      ) : null}

      <ConvertAccountModal
        open={showConvert}
        prospect={convertProspect}
        prefillAmountCad={convertPrefillCad}
        prefillAmountUsd={convertPrefillUsd}
        prefillExchangeRate={convertPrefillExchangeRate}
        prefillExchangeRateDate={convertPrefillExchangeRateDate}
        catalog={catalog}
        defaultConversionSource="call"
        onClose={handleClose}
        onConverted={() => {
          onConverted?.();
          handleClose();
        }}
      />
    </>
  );
}
