import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { AccountContactsSection } from '@/components/AccountContactsSection';
import { AccountDetailsEditor } from '@/components/AccountDetailsEditor';
import { AccountNotesEditor } from '@/components/AccountNotesEditor';
import { AccountCalendarSection } from '@/components/calendar/AccountCalendarSection';
import { ScheduleMeetingModal } from '@/components/calendar/ScheduleMeetingModal';
import { ConvertAccountModal } from '@/components/ConvertAccountModal';
import { AccountEmailSection } from '@/components/messages/AccountEmailSection';
import { AccountMessagesSection } from '@/components/messages/AccountMessagesSection';
import { AccountResearchPanel } from '@/components/accountResearch/AccountResearchPanel';
import {
  OgrProductEmailComposerModal,
  type OgrProductEmailComposerDraft,
} from '@/components/OgrProductEmailComposerModal';
import { ProspectTaxonomyEditor } from '@/components/ProspectTaxonomyEditor';
import { OutreachLeadStateChip } from '@/components/OutreachLeadStateChip';
import { Button } from '@/components/ui/Button';
import { CopyUrlButton } from '@/components/ui/CopyUrlButton';
import { Tag } from '@/components/ui/Tag';
import { formatAccountLocationLine } from '@/lib/accountImport/directoryPresentation';
import { buildCatalogItemEmailCardHtml } from '@/lib/catalogItemEmailCardHtml';
import type { CatalogItem } from '@/lib/catalog';
import { useOptionalLineContext } from '@/lib/lineContext';
import { resolvePricingMarketFromRlaAssignment, type PublicMarket } from '@/lib/pricingMarket';
import { fetchOperationalLineAccount } from '@/lib/retailerLineAccounts';
import { fetchSalesLineTerritoriesClient } from '@/lib/salesLineTerritories';
import { primaryRetailChannelLabel, type Prospect, updateProspectTaxonomy } from '@/lib/prospects';

interface ProspectDetailDrawerProps {
  prospect: Prospect | null;
  onClose: () => void;
  onLogCall: (prospect: Prospect) => void;
  onConverted?: () => void;
  onNotesSaved?: (notes: string | null) => void;
  onTaxonomySaved?: (prospect: Prospect) => void;
  onIdentitySaved?: (prospect: Prospect) => void;
  /** Bump to refetch AccountContactsSection after Log Call creates a contact. */
  contactsReloadToken?: number;
  onContactAdded?: () => void;
  /** Scroll to research section when opened from Briefing. */
  initialScrollToResearch?: boolean;
}

const STATUS_LABEL: Record<Prospect['accountStatus'], string> = {
  prospect: 'Prospect',
  active_account: 'Active account',
  inactive: 'Inactive',
};

const PROSPECT_RESEARCH_SECTION_ID = 'prospect-section-research';

export function ProspectDetailDrawer({
  prospect,
  onClose,
  onLogCall,
  onConverted,
  onNotesSaved,
  onTaxonomySaved,
  onIdentitySaved,
  contactsReloadToken = 0,
  onContactAdded,
  initialScrollToResearch = false,
}: ProspectDetailDrawerProps) {
  const line = useOptionalLineContext();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const appliedResearchScrollRef = useRef<string | null>(null);
  const currentProspectIdRef = useRef<number | null>(prospect?.id ?? null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [researchDraft, setResearchDraft] = useState<OgrProductEmailComposerDraft | null>(null);
  const [researchDraftProduct, setResearchDraftProduct] = useState<CatalogItem | null>(null);
  const [researchDraftBoundProspectId, setResearchDraftBoundProspectId] = useState<number | null>(
    prospect?.id ?? null,
  );
  const [retailerLineAccountRecord, setRetailerLineAccountRecord] = useState<{
    scope: string;
    id: string | null;
  } | null>(null);
  const [emailMarket, setEmailMarket] = useState<PublicMarket>('ca');
  const prospectId = prospect?.id ?? null;
  if (prospectId !== researchDraftBoundProspectId) {
    setResearchDraftBoundProspectId(prospectId);
    setResearchDraft(null);
    setResearchDraftProduct(null);
  }
  const rlaScope = prospect && line.salesLineId ? `${prospect.id}:${line.salesLineId}` : null;
  const retailerLineAccountId =
    rlaScope && retailerLineAccountRecord?.scope === rlaScope ? retailerLineAccountRecord.id : null;

  useEffect(() => {
    currentProspectIdRef.current = prospect?.id ?? null;
  }, [prospect?.id]);

  useEffect(() => {
    if (!prospect || !line.salesLineId) return;
    let active = true;
    void (async () => {
      const scope = `${prospect.id}:${line.salesLineId}`;
      const rla = await fetchOperationalLineAccount({
        retailerId: prospect.id,
        salesLineId: line.salesLineId ?? '',
      });
      if (!active) return;
      setRetailerLineAccountRecord({ scope, id: rla.data?.id ?? null });
      if (!rla.data?.salesLineTerritoryId || !line.lineSlug) {
        setEmailMarket(resolvePricingMarketFromRlaAssignment(null).publicMarket);
        return;
      }
      const list = await fetchSalesLineTerritoriesClient(line.lineSlug);
      if (!active || !list.ok) {
        setEmailMarket(resolvePricingMarketFromRlaAssignment(null).publicMarket);
        return;
      }
      const assignment = list.assignments.find((row) => row.id === rla.data?.salesLineTerritoryId);
      setEmailMarket(
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
  }, [line.lineSlug, line.salesLineId, prospect]);

  useEffect(() => {
    if (!prospect || !initialScrollToResearch) {
      appliedResearchScrollRef.current = null;
      return;
    }
    const key = String(prospect.id);
    if (appliedResearchScrollRef.current === key) return;
    appliedResearchScrollRef.current = key;
    const container = scrollContainerRef.current;
    const target = container?.querySelector<HTMLElement>(`#${PROSPECT_RESEARCH_SECTION_ID}`);
    if (!container || !target) return;
    const timer = window.setTimeout(() => {
      const top =
        target.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop;
      container.scrollTo({ top, behavior: 'smooth' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [initialScrollToResearch, prospect]);

  if (!prospect) return null;

  const canConvert =
    prospect.accountStatus !== 'active_account' && prospect.accountStatus !== 'inactive';
  const overlayOpen = researchDraft != null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-neutral-900/40" onClick={onClose} aria-hidden="true" />
      <aside
        className="border-ink/15 bg-surface fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prospect-detail-title"
        inert={overlayOpen ? true : undefined}
        aria-hidden={overlayOpen || undefined}
      >
        <div className="border-ink/10 flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <p
              id="prospect-detail-title"
              className="font-heading flex items-start gap-1.5 text-xl leading-tight"
            >
              <span className="min-w-0">{prospect.name}</span>
              <CopyUrlButton url={prospect.name} label="Copy name" className="mt-1" />
            </p>
            <p className="text-ink/60 m-0 mt-1 text-xs tracking-wide uppercase">
              ID {prospect.id} · {STATUS_LABEL[prospect.accountStatus]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-transparent"
            aria-label="Close"
          >
            <X size={18} strokeWidth={2.75} />
          </button>
        </div>

        <div
          ref={scrollContainerRef}
          className="flex flex-1 flex-col gap-4 overflow-auto px-5 py-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Tag variant="accent-2">{primaryRetailChannelLabel(prospect.category)}</Tag>
            <span className="text-ink/70 text-sm">
              {formatAccountLocationLine({
                city: prospect.city,
                region: prospect.region,
                territoryCode: prospect.territoryCode,
                territoryName: prospect.territoryName,
              })}
            </span>
          </div>
          <OutreachLeadStateChip prospectId={prospect.id} />

          <section id={PROSPECT_RESEARCH_SECTION_ID} className="scroll-mt-2">
            <AccountResearchPanel
              key={`research-${prospect.id}`}
              prospect={prospect}
              retailerLineAccountId={retailerLineAccountId}
              onProspectUpdated={(next) => {
                onTaxonomySaved?.(next);
                onIdentitySaved?.(next);
              }}
              onContactAdded={() => onContactAdded?.()}
              onOpenDraftComposer={({ draft, catalogItem }) => {
                if (currentProspectIdRef.current !== prospect.id) return;
                setResearchDraftProduct(catalogItem);
                setResearchDraft(draft);
              }}
            />
          </section>

          <AccountDetailsEditor
            key={`identity-${prospect.id}`}
            prospect={prospect}
            onSaved={(next) => onIdentitySaved?.(next)}
          />

          <ProspectTaxonomyEditor
            key={prospect.id}
            collapsible
            category={prospect.category}
            secondaryChannels={prospect.secondaryChannels}
            retailSubchannels={prospect.retailSubchannels}
            venueContexts={prospect.venueContexts}
            lifestyleThemes={prospect.lifestyleThemes}
            retailCapabilities={prospect.retailCapabilities}
            onSave={async (patch) => {
              const result = await updateProspectTaxonomy(prospect.id, patch, prospect);
              if (result.error || !result.data) throw new Error(result.error ?? 'Save failed');
              onTaxonomySaved?.(result.data);
            }}
          />

          <AccountNotesEditor
            key={`notes-${prospect.id}`}
            accountId={prospect.id}
            initialNotes={prospect.notes}
            onSaved={onNotesSaved}
          />

          <AccountContactsSection accountId={prospect.id} reloadToken={contactsReloadToken} />

          <AccountMessagesSection prospectId={prospect.id} />

          <AccountEmailSection prospectId={prospect.id} />

          <AccountCalendarSection
            prospectId={prospect.id}
            refreshKey={calendarRefreshKey}
            onScheduleMeeting={() => setScheduleOpen(true)}
          />
        </div>

        <div className="border-ink/10 flex flex-col gap-2 border-t px-5 py-4">
          {canConvert ? (
            <Button variant="primary" onClick={() => setConvertOpen(true)}>
              Convert to Active Account
            </Button>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => {
              onLogCall(prospect);
              onClose();
            }}
          >
            Log Call
          </Button>
        </div>
      </aside>

      {researchDraft && researchDraftProduct ? (
        <OgrProductEmailComposerModal
          open
          overlayClassName="z-[60]"
          productId={researchDraftProduct.id}
          productName={researchDraftProduct.name}
          cardHtml={buildCatalogItemEmailCardHtml(researchDraftProduct, emailMarket)}
          draft={researchDraft}
          prospectId={prospect.id}
          salesLineId={line.salesLineId}
          retailerLineAccountId={retailerLineAccountId}
          onClose={() => {
            setResearchDraft(null);
            setResearchDraftProduct(null);
          }}
          onSent={() => {
            setResearchDraft(null);
            setResearchDraftProduct(null);
          }}
        />
      ) : null}

      <ConvertAccountModal
        open={convertOpen}
        prospect={prospect}
        onClose={() => setConvertOpen(false)}
        onConverted={() => {
          setConvertOpen(false);
          onConverted?.();
          onClose();
        }}
      />

      <ScheduleMeetingModal
        open={scheduleOpen}
        prospectId={prospect.id}
        prospectName={prospect.name}
        onClose={() => setScheduleOpen(false)}
        onCreated={() => setCalendarRefreshKey((n) => n + 1)}
      />
    </>
  );
}
