import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { AccountContactsSection } from '@/components/AccountContactsSection';
import { AccountDetailsEditor } from '@/components/AccountDetailsEditor';
import { AccountEmailProductPickerModal } from '@/components/AccountEmailProductPickerModal';
import { AccountNotesEditor } from '@/components/AccountNotesEditor';
import { AccountCalendarSection } from '@/components/calendar/AccountCalendarSection';
import { ScheduleMeetingModal } from '@/components/calendar/ScheduleMeetingModal';
import { AccountEmailSection } from '@/components/messages/AccountEmailSection';
import { AccountMessagesSection } from '@/components/messages/AccountMessagesSection';
import {
  OgrProductEmailComposerModal,
  type OgrProductEmailComposerDraft,
} from '@/components/OgrProductEmailComposerModal';
import { AccountResearchPanel } from '@/components/accountResearch/AccountResearchPanel';
import { Button } from '@/components/ui/Button';
import { CopyUrlButton } from '@/components/ui/CopyUrlButton';
import { Field, FieldLabel, Input, Select } from '@/components/ui/Input';
import { Tag } from '@/components/ui/Tag';
import {
  accountContactRoleLabel,
  searchContactsByName,
  type AccountContactSearchHit,
} from '@/lib/accountContacts';
import type { AccountProductEmailRecipientOption } from '@/lib/accountProductEmailRecipient';
import { apparelSeasonLabel } from '@/lib/apparelSeasons';
import type { AccountReorderSettingsRow } from '@/lib/accountReorderSettings';
import { demoteToProspect } from '@/lib/convertToActiveAccount';
import type { CatalogItem } from '@/lib/catalog';
import { buildCatalogItemEmailCardHtml } from '@/lib/catalogItemEmailCardHtml';
import { useOptionalLineContext } from '@/lib/lineContext';
import { resolvePricingMarketFromRlaAssignment, type PublicMarket } from '@/lib/pricingMarket';
import { primaryRetailChannelLabel, updateProspectTaxonomy, type Prospect } from '@/lib/prospects';
import { formatAccountLocationLine } from '@/lib/accountImport/directoryPresentation';
import { ProspectTaxonomyEditor } from '@/components/ProspectTaxonomyEditor';
import { OutreachLeadStateChip } from '@/components/OutreachLeadStateChip';
import { fetchOperationalLineAccount, isStaffSellingUiBlocked } from '@/lib/retailerLineAccounts';
import {
  ASSIGNABLE_SLT_STATUSES,
  assignRetailerLineTerritoryClient,
  fetchSalesLineTerritoriesClient,
  suggestedAssignmentForLocation,
  type SalesLineTerritoryAssignment,
} from '@/lib/salesLineTerritories';
import type { ApparelSeason } from '@/types/database';

export interface AccountDetailSummary {
  tlvCad: number;
  lastOrderDate: string | null;
  latestSeason: ApparelSeason | null;
}

type AccountEmailFlow = 'closed' | 'pick' | 'compose';

const ACCOUNT_DRAWER_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'research', label: 'Research' },
  { id: 'taxonomy', label: 'Taxonomy' },
  { id: 'details', label: 'Details' },
  { id: 'notes', label: 'Notes' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'messages', label: 'Messages' },
  { id: 'email', label: 'Email' },
  { id: 'calendar', label: 'Calendar' },
] as const;

export type AccountDrawerSectionId = (typeof ACCOUNT_DRAWER_SECTIONS)[number]['id'];

interface AccountDetailDrawerProps {
  account: Prospect | null;
  summary?: AccountDetailSummary | null;
  reorderSettings?: AccountReorderSettingsRow | null;
  onClose: () => void;
  onLogCall: (account: Prospect) => void;
  onLogOrder: (account: Prospect) => void;
  onNotesSaved?: (notes: string | null) => void;
  onTaxonomySaved?: (prospect: Prospect) => void;
  onIdentitySaved?: (prospect: Prospect) => void;
  onDemoted?: (prospect: Prospect) => void;
  /** Bump to refetch AccountContactsSection after Log Call creates a contact. */
  contactsReloadToken?: number;
  onContactAdded?: () => void;
  /** Fired after a successful product email send from this drawer. */
  onProductEmailSent?: () => void;
  /** Scroll to this section when the drawer opens (e.g. Briefing research deep link). */
  initialSection?: AccountDrawerSectionId;
}

function formatCad(amount: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

function accountSectionDomId(sectionId: AccountDrawerSectionId): string {
  return `account-section-${sectionId}`;
}

function LineRightsAssignField({ account }: { account: Prospect }) {
  const line = useOptionalLineContext();
  const [assignments, setAssignments] = useState<SalesLineTerritoryAssignment[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [rlaId, setRlaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!line.multiLineTerritoryAdmin || !line.salesLineId || !line.lineSlug) return;
    let active = true;
    void Promise.all([
      fetchOperationalLineAccount({ retailerId: account.id, salesLineId: line.salesLineId }),
      fetchSalesLineTerritoriesClient(line.lineSlug),
    ]).then(([rla, list]) => {
      if (!active) return;
      if (rla.error) {
        setError(rla.error);
        setLoading(false);
        return;
      }
      if (!list.ok) {
        setError(list.error);
        setLoading(false);
        return;
      }
      setRlaId(rla.data?.id ?? null);
      setSelectedId(rla.data?.salesLineTerritoryId ?? '');
      setAssignments(
        list.assignments.filter((row) => ASSIGNABLE_SLT_STATUSES.includes(row.status)),
      );
      setError(null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [account.id, line.lineSlug, line.multiLineTerritoryAdmin, line.salesLineId]);

  if (!line.multiLineTerritoryAdmin || !line.salesLineId || !line.lineSlug) return null;

  const suggested = suggestedAssignmentForLocation(assignments, account.territoryCode);

  async function handleChange(nextId: string) {
    if (!rlaId) return;
    setSaving(true);
    setError(null);
    const result = await assignRetailerLineTerritoryClient({
      retailerLineAccountId: rlaId,
      salesLineTerritoryId: nextId || null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSelectedId(nextId);
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-heading m-0 text-base">Line territory rights</h3>
      {loading ? <p className="text-ink/60 m-0 text-xs">Loading assignments…</p> : null}
      {!loading && !rlaId ? (
        <p className="text-ink/60 m-0 text-xs">No line account to assign yet.</p>
      ) : null}
      {!loading && rlaId ? (
        <Field>
          <FieldLabel>Assignment</FieldLabel>
          <Select
            value={selectedId}
            disabled={saving}
            onChange={(event) => void handleChange(event.target.value)}
          >
            <option value="">Unassigned</option>
            {assignments.map((row) => (
              <option key={row.id} value={row.id}>
                {row.territoryName}
                {row.parentTerritoryName ? ` under ${row.parentTerritoryName}` : ''} ({row.status})
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {suggested && suggested.id !== selectedId ? (
        <p className="text-ink/55 m-0 text-xs">
          Suggested from store location: {suggested.territoryName}. Confirm to attach.
        </p>
      ) : null}
      {error ? (
        <p className="text-accent-800 m-0 text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function ContactNameSearch({ currentAccountId }: { currentAccountId: number }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHits, setSearchHits] = useState<AccountContactSearchHit[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);

  const q = searchQuery.trim();
  const showResults = q.length >= 2;

  useEffect(() => {
    if (!showResults) return;

    let active = true;
    const timer = window.setTimeout(() => {
      void searchContactsByName(q).then((result) => {
        if (!active) return;
        setSearchBusy(false);
        if (result.error) {
          setSearchHits([]);
          setSearchError(result.error);
          return;
        }
        setSearchError(null);
        setSearchHits(result.data);
      });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [q, showResults]);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-ink/70 text-xs" htmlFor="account-contact-search">
        Find contact by name
      </label>
      <Input
        id="account-contact-search"
        placeholder="Search buyers, managers, owners…"
        value={searchQuery}
        onChange={(e) => {
          const next = e.target.value;
          setSearchQuery(next);
          if (next.trim().length < 2) {
            setSearchHits([]);
            setSearchError(null);
            setSearchBusy(false);
          } else {
            setSearchBusy(true);
          }
        }}
      />
      {showResults && searchBusy ? <p className="text-ink/60 m-0 text-xs">Searching…</p> : null}
      {showResults && searchError ? (
        <p className="text-accent-800 m-0 text-xs" role="alert">
          {searchError}
        </p>
      ) : null}
      {showResults && !searchBusy && searchHits.length > 0 ? (
        <ul className="border-ink/10 m-0 list-none rounded-md border p-0 text-xs">
          {searchHits.map((hit) => (
            <li key={hit.id} className="border-ink/10 border-b px-3 py-2 last:border-b-0">
              <span className="font-semibold">{hit.fullName}</span>
              {' · '}
              {accountContactRoleLabel(hit.role)}
              <div className="text-ink/65 mt-0.5">
                {hit.accountName} ({hit.accountCity})
                {hit.accountId !== currentAccountId ? ' — other account' : ''}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {showResults && !searchBusy && !searchError && searchHits.length === 0 ? (
        <p className="text-ink/60 m-0 text-xs">No contacts match.</p>
      ) : null}
    </div>
  );
}

export function AccountDetailDrawer({
  account,
  summary = null,
  reorderSettings = null,
  onClose,
  onLogCall,
  onLogOrder,
  onNotesSaved,
  onTaxonomySaved,
  onIdentitySaved,
  onDemoted,
  contactsReloadToken = 0,
  onContactAdded,
  onProductEmailSent,
  initialSection,
}: AccountDetailDrawerProps) {
  const [demoteBusy, setDemoteBusy] = useState(false);
  const [demoteError, setDemoteError] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [emailFlow, setEmailFlow] = useState<AccountEmailFlow>('closed');
  const [emailProduct, setEmailProduct] = useState<CatalogItem | null>(null);
  const [emailTo, setEmailTo] = useState('');
  const [emailRecipientName, setEmailRecipientName] = useState('');
  const [emailAccountContactId, setEmailAccountContactId] = useState<string | null>(null);
  const [emailRecipientHint, setEmailRecipientHint] = useState<string | null>(null);
  const [emailRecipientOptions, setEmailRecipientOptions] = useState<
    AccountProductEmailRecipientOption[]
  >([]);
  const [retailerLineAccountRecord, setRetailerLineAccountRecord] = useState<{
    scope: string;
    id: string | null;
  } | null>(null);
  const [accountEmailMarket, setAccountEmailMarket] = useState<PublicMarket>('ca');
  const [emailBoundAccountId, setEmailBoundAccountId] = useState<number | null>(
    account?.id ?? null,
  );
  const composerSentRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const appliedInitialSectionRef = useRef<string | null>(null);
  const currentAccountIdRef = useRef<number | null>(account?.id ?? null);
  const [researchDraft, setResearchDraft] = useState<OgrProductEmailComposerDraft | null>(null);
  const [researchDraftProduct, setResearchDraftProduct] = useState<CatalogItem | null>(null);
  const [researchDraftBoundAccountId, setResearchDraftBoundAccountId] = useState<number | null>(
    account?.id ?? null,
  );
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
  const eaglePeakOutreachBlocked = line.lineSlug === 'eagle-peak' && !line.eaglePeakOutreach;
  const bigFishOutreachBlocked = line.lineSlug === 'big-fish' && !line.bigFishOutreach;
  const emailProductBlocked = eaglePeakOutreachBlocked || bigFishOutreachBlocked;
  const emailOverlayOpen = emailFlow !== 'closed' || researchDraft != null;
  const rlaScope = account && line.salesLineId ? `${account.id}:${line.salesLineId}` : null;
  const retailerLineAccountId =
    rlaScope && retailerLineAccountRecord?.scope === rlaScope ? retailerLineAccountRecord.id : null;
  const researchDraftAccountId = account?.id ?? null;
  if (researchDraftAccountId !== researchDraftBoundAccountId) {
    setResearchDraftBoundAccountId(researchDraftAccountId);
    setResearchDraft(null);
    setResearchDraftProduct(null);
  }

  useEffect(() => {
    currentAccountIdRef.current = account?.id ?? null;
  }, [account?.id]);

  const emailSessionAccountId = account?.id ?? null;
  // Copilot suggestion ignored: useEffect setState fails react-hooks/set-state-in-effect; render-time prop sync is the React-supported pattern.
  if (emailSessionAccountId !== emailBoundAccountId) {
    setEmailBoundAccountId(emailSessionAccountId);
    setEmailFlow('closed');
    setEmailProduct(null);
    setEmailTo('');
    setEmailRecipientName('');
    setEmailAccountContactId(null);
    setEmailRecipientHint(null);
    setEmailRecipientOptions([]);
  }

  useEffect(() => {
    if (!account || !line.salesLineId) return;
    const scope = `${account.id}:${line.salesLineId}`;
    let active = true;
    void (async () => {
      const rla = await fetchOperationalLineAccount({
        retailerId: account.id,
        salesLineId: line.salesLineId ?? '',
      });
      if (!active) return;
      setRetailerLineAccountRecord({ scope, id: rla.data?.id ?? null });
      if (!rla.data) {
        setAccountEmailMarket('ca');
        return;
      }
      if (!rla.data.salesLineTerritoryId || !line.lineSlug) {
        setAccountEmailMarket(resolvePricingMarketFromRlaAssignment(null).publicMarket);
        return;
      }
      const list = await fetchSalesLineTerritoriesClient(line.lineSlug);
      if (!active) return;
      if (!list.ok) {
        setAccountEmailMarket(resolvePricingMarketFromRlaAssignment(null).publicMarket);
        return;
      }
      const assignment = list.assignments.find((row) => row.id === rla.data?.salesLineTerritoryId);
      setAccountEmailMarket(
        resolvePricingMarketFromRlaAssignment(
          assignment
            ? {
                status: assignment.status,
                countryCode: assignment.countryCode,
                territoryId: assignment.territoryId,
                territoryCode: assignment.territoryCode,
              }
            : null,
        ).publicMarket,
      );
    })();
    return () => {
      active = false;
    };
  }, [account, line.lineSlug, line.salesLineId]);

  useEffect(() => {
    if (!account || !initialSection) {
      appliedInitialSectionRef.current = null;
      return;
    }
    const key = `${account.id}:${initialSection}`;
    if (appliedInitialSectionRef.current === key) return;
    appliedInitialSectionRef.current = key;
    const timer = window.setTimeout(() => {
      const container = scrollContainerRef.current;
      const target = container?.querySelector<HTMLElement>(
        `#${accountSectionDomId(initialSection)}`,
      );
      if (!container || !target) return;
      const top =
        target.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop;
      container.scrollTo({ top, behavior: 'smooth' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [account, initialSection]);

  if (!account) return null;
  const current = account;

  async function handleDemote() {
    const confirmed = window.confirm(
      `Move ${current.name} back to Prospects?\n\nOrder history and contacts stay on this account (ID ${current.id}). It will leave Active Accounts.`,
    );
    if (!confirmed) return;

    setDemoteBusy(true);
    setDemoteError(null);
    const result = await demoteToProspect({
      accountId: current.id,
      currentStatus: current.accountStatus,
      writesEnabled: line.multiLineWrites,
      salesLineId: line.multiLineWrites ? line.salesLineId : null,
    });
    setDemoteBusy(false);

    if (!result.ok) {
      setDemoteError(result.error);
      return;
    }

    onDemoted?.({
      ...current,
      accountStatus: 'prospect',
      convertedAt: null,
    });
    onClose();
  }

  function handleAccountClose() {
    if (emailOverlayOpen) return;
    onClose();
  }

  function resetEmailCompose() {
    setEmailProduct(null);
    setEmailTo('');
    setEmailRecipientName('');
    setEmailAccountContactId(null);
    setEmailRecipientHint(null);
    setEmailRecipientOptions([]);
  }

  function scrollToSection(sectionId: AccountDrawerSectionId) {
    const container = scrollContainerRef.current;
    const target = container?.querySelector<HTMLElement>(`#${accountSectionDomId(sectionId)}`);
    if (!container || !target) return;
    const top =
      target.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop;
    container.scrollTo({ top, behavior: 'smooth' });
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-neutral-900/40"
        onClick={handleAccountClose}
        aria-hidden="true"
      />
      <aside
        className="border-ink/15 bg-surface fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l shadow-xl md:w-2/3"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-detail-title"
        inert={emailOverlayOpen ? true : undefined}
        aria-hidden={emailOverlayOpen || undefined}
      >
        <div className="border-ink/10 flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <p
              id="account-detail-title"
              className="font-heading flex items-start gap-1.5 text-xl leading-tight"
            >
              <span className="min-w-0">{account.name}</span>
              <CopyUrlButton url={account.name} label="Copy name" className="mt-1" />
            </p>
            <p className="text-ink/60 m-0 mt-1 text-xs tracking-wide uppercase">
              ID {account.id} · Active account
            </p>
          </div>
          <button
            type="button"
            onClick={handleAccountClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-transparent"
            aria-label="Close"
          >
            <X size={18} strokeWidth={2.75} />
          </button>
        </div>

        <nav
          aria-label="Account sections"
          className="border-ink/10 flex shrink-0 gap-1 overflow-x-auto border-b px-5 py-2"
        >
          {ACCOUNT_DRAWER_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className="text-ink/65 hover:text-ink hover:bg-ink/[0.04] shrink-0 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors"
              onClick={() => scrollToSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <div
          ref={scrollContainerRef}
          className="flex flex-1 flex-col gap-5 overflow-auto px-5 py-4"
        >
          <section id={accountSectionDomId('overview')} className="flex scroll-mt-2 flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <Tag variant="accent-2">{primaryRetailChannelLabel(account.category)}</Tag>
              <span className="text-ink/70 text-sm">
                {formatAccountLocationLine({
                  city: account.city,
                  region: account.region,
                  territoryCode: account.territoryCode,
                  territoryName: account.territoryName,
                })}
              </span>
            </div>
            <OutreachLeadStateChip prospectId={account.id} />

            <LineRightsAssignField key={`line-rights-${account.id}`} account={account} />

            <dl className="m-0 grid gap-3 text-sm">
              <div>
                <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">Converted</dt>
                <dd className="m-0 mt-0.5">{formatTimestamp(account.convertedAt)}</dd>
              </div>
              <div>
                <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">
                  Initial order date
                </dt>
                <dd className="m-0 mt-0.5">{formatTimestamp(account.initialOrderDate)}</dd>
              </div>
              {summary ? (
                <>
                  <div>
                    <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">TLV</dt>
                    <dd className="m-0 mt-0.5">{formatCad(summary.tlvCad)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">
                      Last order
                    </dt>
                    <dd className="m-0 mt-0.5">{summary.lastOrderDate || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">Season</dt>
                    <dd className="m-0 mt-0.5">
                      {summary.latestSeason ? apparelSeasonLabel(summary.latestSeason) : '—'}
                    </dd>
                  </div>
                </>
              ) : null}
              {reorderSettings?.next_suggested_contact_date ? (
                <div>
                  <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">
                    Next suggested contact
                  </dt>
                  <dd className="m-0 mt-0.5">{reorderSettings.next_suggested_contact_date}</dd>
                </div>
              ) : null}
              {reorderSettings?.ai_reorder_notes ? (
                <div>
                  <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">
                    AI reorder notes
                  </dt>
                  <dd className="text-ink/80 m-0 mt-0.5 leading-relaxed">
                    {reorderSettings.ai_reorder_notes}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section id={accountSectionDomId('research')} className="scroll-mt-2">
            <AccountResearchPanel
              key={`research-${account.id}`}
              prospect={account}
              retailerLineAccountId={retailerLineAccountId}
              onProspectUpdated={(next) => {
                onTaxonomySaved?.(next);
                onIdentitySaved?.(next);
              }}
              onContactAdded={() => onContactAdded?.()}
              onOpenDraftComposer={({ draft, catalogItem }) => {
                if (currentAccountIdRef.current !== account.id) return;
                setResearchDraftProduct(catalogItem);
                setResearchDraft(draft);
              }}
            />
          </section>

          <section id={accountSectionDomId('taxonomy')} className="scroll-mt-2">
            <ProspectTaxonomyEditor
              key={account.id}
              collapsible
              category={account.category}
              secondaryChannels={account.secondaryChannels}
              retailSubchannels={account.retailSubchannels}
              venueContexts={account.venueContexts}
              lifestyleThemes={account.lifestyleThemes}
              retailCapabilities={account.retailCapabilities}
              onSave={async (patch) => {
                const result = await updateProspectTaxonomy(account.id, patch, account);
                if (result.error || !result.data) throw new Error(result.error ?? 'Save failed');
                onTaxonomySaved?.(result.data);
              }}
            />
          </section>

          <section id={accountSectionDomId('details')} className="scroll-mt-2">
            <AccountDetailsEditor
              key={`identity-${account.id}`}
              prospect={account}
              onSaved={(next) => onIdentitySaved?.(next)}
            />
          </section>

          <section id={accountSectionDomId('notes')} className="scroll-mt-2">
            <AccountNotesEditor
              key={account.id}
              accountId={account.id}
              initialNotes={account.notes}
              onSaved={onNotesSaved}
            />
          </section>

          <section id={accountSectionDomId('contacts')} className="flex scroll-mt-2 flex-col gap-5">
            <ContactNameSearch key={account.id} currentAccountId={account.id} />

            <AccountContactsSection
              key={account.id}
              accountId={account.id}
              reloadToken={contactsReloadToken}
            />
          </section>

          <section id={accountSectionDomId('messages')} className="scroll-mt-2">
            <AccountMessagesSection key={`messages-${account.id}`} prospectId={account.id} />
          </section>

          <section id={accountSectionDomId('email')} className="scroll-mt-2">
            <AccountEmailSection key={`email-${account.id}`} prospectId={account.id} />
          </section>

          <section id={accountSectionDomId('calendar')} className="scroll-mt-2">
            <AccountCalendarSection
              key={`calendar-${account.id}`}
              prospectId={account.id}
              refreshKey={calendarRefreshKey}
              onScheduleMeeting={() => setScheduleOpen(true)}
            />
          </section>
        </div>

        <div className="border-ink/10 flex flex-col gap-2 border-t px-5 py-4">
          {demoteError ? (
            <p className="text-accent-800 m-0 text-xs" role="alert">
              {demoteError}
            </p>
          ) : null}
          {emailProductBlocked ? null : (
            <Button
              variant="secondary"
              onClick={() => {
                composerSentRef.current = false;
                setEmailFlow('pick');
              }}
            >
              Email product
            </Button>
          )}
          {sellingBlocked ? (
            <p className="text-ink/60 m-0 text-xs">
              Selling for this line is not enabled yet (convert, orders, calls, and demote stay on
              Old Guys Rule).
            </p>
          ) : (
            <>
              <Button
                variant="primary"
                onClick={() => {
                  onLogOrder(account);
                  onClose();
                }}
              >
                + Log Order / Reorder
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  onLogCall(account);
                  onClose();
                }}
              >
                Log Call
              </Button>
              <Button variant="secondary" disabled={demoteBusy} onClick={() => void handleDemote()}>
                {demoteBusy ? 'Moving…' : 'Move to Prospects'}
              </Button>
            </>
          )}
        </div>
      </aside>

      <ScheduleMeetingModal
        open={scheduleOpen}
        prospectId={account.id}
        prospectName={account.name}
        onClose={() => setScheduleOpen(false)}
        onCreated={() => setCalendarRefreshKey((n) => n + 1)}
      />

      {researchDraft && researchDraftProduct ? (
        <OgrProductEmailComposerModal
          open
          overlayClassName="z-[60]"
          productId={researchDraftProduct.id}
          productName={researchDraftProduct.name}
          cardHtml={buildCatalogItemEmailCardHtml(researchDraftProduct, accountEmailMarket)}
          draft={researchDraft}
          prospectId={account.id}
          salesLineId={line.salesLineId}
          retailerLineAccountId={retailerLineAccountId}
          onClose={() => {
            if (composerSentRef.current) {
              composerSentRef.current = false;
              return;
            }
            setResearchDraft(null);
            setResearchDraftProduct(null);
          }}
          onSent={() => {
            composerSentRef.current = true;
            setResearchDraft(null);
            setResearchDraftProduct(null);
            onProductEmailSent?.();
          }}
        />
      ) : null}

      {emailFlow === 'pick' ? (
        <AccountEmailProductPickerModal
          open
          accountId={account.id}
          salesLineId={line.salesLineId}
          lineSlug={line.lineSlug}
          onClose={() => {
            setEmailFlow('closed');
            resetEmailCompose();
          }}
          onPick={(pick) => {
            setEmailProduct(pick.item);
            setEmailTo(pick.to);
            setEmailRecipientName(pick.recipientName);
            setEmailAccountContactId(pick.accountContactId);
            setEmailRecipientHint(pick.recipientHint);
            setEmailRecipientOptions(pick.recipientOptions);
            setEmailFlow('compose');
          }}
        />
      ) : null}

      {emailFlow === 'compose' && emailProduct ? (
        <OgrProductEmailComposerModal
          open
          overlayClassName="z-[60]"
          productId={emailProduct.id}
          productName={emailProduct.name}
          cardHtml={buildCatalogItemEmailCardHtml(emailProduct, accountEmailMarket)}
          defaultTo={emailTo}
          defaultRecipientName={emailRecipientName}
          recipientHint={emailRecipientHint}
          prospectId={account.id}
          accountContactId={emailAccountContactId}
          salesLineId={line.salesLineId}
          retailerLineAccountId={retailerLineAccountId}
          recipientOptions={emailRecipientOptions}
          onClose={() => {
            if (composerSentRef.current) {
              composerSentRef.current = false;
              return;
            }
            setEmailFlow('pick');
          }}
          onSent={() => {
            composerSentRef.current = true;
            setEmailFlow('closed');
            resetEmailCompose();
            onProductEmailSent?.();
          }}
        />
      ) : null}
    </>
  );
}
