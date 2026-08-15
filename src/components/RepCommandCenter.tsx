import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/Header';
import { TabNav } from '@/components/TabNav';
import { LogCallModal } from '@/components/LogCallModal';
import { AgentBriefingTab } from '@/components/tabs/AgentBriefingTab';
import { CatalogTab } from '@/components/tabs/CatalogTab';
import { DashboardTab } from '@/components/tabs/DashboardTab';
import { CallsTab } from '@/components/tabs/CallsTab';
import { ProspectsTab } from '@/components/tabs/ProspectsTab';
import { ActiveAccountsTab } from '@/components/tabs/ActiveAccountsTab';
import { ContactsTab } from '@/components/tabs/ContactsTab';
import { InsightsTab } from '@/components/tabs/InsightsTab';
import { StaffChatDock } from '@/components/messages/StaffChatDock';
import { CalendarTab } from '@/components/tabs/CalendarTab';
import { MessagesTab } from '@/components/tabs/MessagesTab';
import { useLandedCostCalculator } from '@/hooks/useLandedCostCalculator';
import { useStaffLiveChatInbox } from '@/hooks/useStaffLiveChatInbox';
import { fetchAllContacts, type ContactDirectoryRow } from '@/lib/accountContacts';
import { fetchCatalogItems, type CatalogItem } from '@/lib/catalog';
import { fetchCatalogSettings, type CatalogSupplierTerms } from '@/lib/catalogSettings';
import { useOptionalLineContext } from '@/lib/lineContext';
import { persistLastLineSlug } from '@/lib/lineContextStorage';
import { fetchNeedsMappingCount, type MessageThread } from '@/lib/messages';
import { fetchProspects, type Prospect } from '@/lib/prospects';
import { resolveLineAccountForSlug } from '@/lib/retailerLineAccounts';
import {
  upsertOpenLiveChat,
  surfaceLiveChatAsPill,
  type OpenLiveChatSlot,
} from '@/lib/staffChatDockState';
import { fetchTerritories, type Territory } from '@/lib/territories';
import type { LineKey, TabKey } from '@/types';

interface RepCommandCenterProps {
  defaultTab?: TabKey;
  multiLineUi?: boolean;
  lineAccountId?: string;
}

function parseAppDeepLinks(): {
  sku: string | null;
  draftId: string | null;
  prospectId: number | null;
} {
  if (typeof window === 'undefined') {
    return { sku: null, draftId: null, prospectId: null };
  }
  const params = new URLSearchParams(window.location.search);
  const sku = params.get('sku')?.trim() || null;
  const draftId = params.get('draftId')?.trim() || null;
  const prospectRaw = params.get('prospectId')?.trim();
  const prospectId =
    prospectRaw && Number.isFinite(Number(prospectRaw)) ? Number(prospectRaw) : null;
  return { sku, draftId, prospectId };
}

export function RepCommandCenter({
  defaultTab = 'catalog',
  multiLineUi = false,
  lineAccountId,
}: RepCommandCenterProps) {
  const lineCtx = useOptionalLineContext();
  const salesLineId = multiLineUi ? lineCtx.salesLineId : null;
  const lineSlug = (multiLineUi ? lineCtx.lineSlug : 'ogr') as LineKey | null;
  const lineReady = !multiLineUi || (!lineCtx.loading && Boolean(salesLineId));

  const initialLinks = parseAppDeepLinks();
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStoreId, setModalStoreId] = useState<number | null>(null);
  const [callsReloadToken, setCallsReloadToken] = useState(0);
  const [directoryReloadToken, setDirectoryReloadToken] = useState(0);
  const [contactsReloadToken, setContactsReloadToken] = useState(0);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [supplierTerms, setSupplierTerms] = useState<CatalogSupplierTerms | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [contacts, setContacts] = useState<ContactDirectoryRow[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [messagesNeedsMappingCount, setMessagesNeedsMappingCount] = useState(0);
  const [openLiveChats, setOpenLiveChats] = useState<OpenLiveChatSlot[]>([]);
  const [messagesReloadToken, setMessagesReloadToken] = useState(0);
  const [deepLinkSku, setDeepLinkSku] = useState<string | null>(initialLinks.sku);
  const [deepLinkDraftId, setDeepLinkDraftId] = useState<string | null>(initialLinks.draftId);
  const [deepLinkProspectId, setDeepLinkProspectId] = useState<number | null>(
    initialLinks.prospectId,
  );
  const [deepLinkAccountId, setDeepLinkAccountId] = useState<number | null>(null);
  const [lineAccountError, setLineAccountError] = useState<string | null>(null);

  // URL prospectId may belong to an active account — remap once directory is loaded.
  // Copilot suggestion ignored: useEffect setState fails react-hooks/set-state-in-effect; render-time prop sync is the React-supported pattern.
  if (deepLinkProspectId != null && prospects.length > 0) {
    const match = prospects.find((p) => p.id === deepLinkProspectId);
    if (match?.accountStatus === 'active_account') {
      setDeepLinkAccountId(match.id);
      setDeepLinkProspectId(null);
      if (activeTab === 'prospects') setActiveTab('accounts');
    }
  }

  const clearCatalogDeepLink = useCallback(() => {
    setDeepLinkSku(null);
    setDeepLinkDraftId(null);
  }, []);

  const clearProspectDeepLink = useCallback(() => {
    setDeepLinkProspectId(null);
  }, []);

  const clearAccountDeepLink = useCallback(() => {
    setDeepLinkAccountId(null);
  }, []);

  const openDraftDeepLink = useCallback((args: { sku: string; draftId: string }) => {
    setDeepLinkSku(args.sku);
    setDeepLinkDraftId(args.draftId);
    setActiveTab('catalog');
  }, []);

  const openProspectDeepLink = useCallback(
    (args: { prospectId: number; accountStatus?: string }) => {
      if (args.accountStatus === 'active_account') {
        setDeepLinkAccountId(args.prospectId);
        setDeepLinkProspectId(null);
        setActiveTab('accounts');
        return;
      }
      setDeepLinkProspectId(args.prospectId);
      setDeepLinkAccountId(null);
      setActiveTab('prospects');
    },
    [],
  );

  const openLiveChat = useCallback((thread: MessageThread) => {
    if (thread.channel !== 'live_chat') return;
    setOpenLiveChats((prev) => upsertOpenLiveChat(prev, thread));
  }, []);

  const surfaceLiveChatPill = useCallback((thread: MessageThread) => {
    if (thread.channel !== 'live_chat') return;
    setOpenLiveChats((prev) => surfaceLiveChatAsPill(prev, thread, { unread: 0 }));
  }, []);

  useStaffLiveChatInbox({
    setOpenLiveChats,
    onInboxActivity: () => setMessagesReloadToken((n) => n + 1),
  });

  const {
    fx,
    setFx,
    freightRate,
    setFreightRate,
    gstRate,
    setGstRate,
    otherTaxRate,
    setOtherTaxRate,
    factors,
    researchBrief,
    setResearchBrief,
    ratesAsOf,
    setRatesAsOf,
    keystoneMarginRate,
    setKeystoneMarginRate,
    marginRangeDisplay,
  } = useLandedCostCalculator(catalog);

  const pipelineProspects = useMemo(
    () => prospects.filter((p) => p.accountStatus !== 'active_account'),
    [prospects],
  );
  const activeAccounts = useMemo(
    () => prospects.filter((p) => p.accountStatus === 'active_account'),
    [prospects],
  );

  const reloadDirectory = useCallback(() => {
    setDirectoryReloadToken((n) => n + 1);
  }, []);

  const reloadContacts = useCallback(() => {
    setContactsReloadToken((n) => n + 1);
  }, []);

  // Wrong-line account detail isolation (audit §7.1 / epic §10).
  useEffect(() => {
    if (!multiLineUi || !lineAccountId || !lineSlug) return;
    let active = true;
    void resolveLineAccountForSlug({ lineSlug, lineAccountId }).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setLineAccountError(
          result.reason === 'wrong_line'
            ? 'This account does not belong to the selected line.'
            : 'Account not found.',
        );
        return;
      }
      setLineAccountError(null);
      setDeepLinkAccountId(result.retailerId);
      setActiveTab('accounts');
    });
    return () => {
      active = false;
    };
  }, [multiLineUi, lineAccountId, lineSlug]);

  function navigateToLine(slug: LineKey) {
    lineCtx.selectLineSlug(slug);
    persistLastLineSlug(slug);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', activeTab);
    window.location.assign(`/app/lines/${slug}?${params.toString()}`);
  }

  useEffect(() => {
    if (multiLineUi && !lineReady) return;

    let active = true;
    const isInitial = directoryReloadToken === 0;

    async function load() {
      if (isInitial || multiLineUi) {
        setDirectoryLoading(true);
      }
      setDirectoryError(null);
      const scoped = multiLineUi && salesLineId ? { salesLineId } : {};
      const catalogOpts =
        multiLineUi && salesLineId
          ? { lineId: salesLineId }
          : multiLineUi && lineSlug
            ? { lineCode: lineSlug }
            : {};
      const [
        catalogResult,
        supplierTermsResult,
        prospectsResult,
        territoriesResult,
        contactsResult,
      ] = await Promise.all([
        fetchCatalogItems(catalogOpts),
        fetchCatalogSettings(catalogOpts),
        fetchProspects(scoped),
        fetchTerritories(),
        fetchAllContacts(scoped),
      ]);

      if (!active) return;

      const errors = [catalogResult.error, prospectsResult.error, contactsResult.error].filter(
        Boolean,
      );
      if (errors.length) {
        if (isInitial) {
          setCatalog([]);
          setProspects([]);
          setTerritories([]);
          setContacts([]);
        }
        setDirectoryError(errors.join(' · '));
        setDirectoryLoading(false);
        return;
      }

      setCatalog(catalogResult.data);
      // Supplier terms are supplemental (Ordering section); don't block the directory on them.
      setSupplierTerms(supplierTermsResult.error ? null : supplierTermsResult.data);
      setProspects(prospectsResult.data);
      // Territories power an optional filter; don't block the directory if they fail.
      setTerritories(territoriesResult.error ? [] : territoriesResult.data);
      setContacts(contactsResult.data);
      setDirectoryLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [directoryReloadToken, multiLineUi, salesLineId, lineSlug, lineReady]);

  useEffect(() => {
    if (contactsReloadToken === 0) return;
    if (multiLineUi && !lineReady) return;
    let active = true;
    const scoped = multiLineUi && salesLineId ? { salesLineId } : {};
    void fetchAllContacts(scoped).then((result) => {
      if (!active) return;
      if (result.error) return;
      setContacts(result.data);
    });
    return () => {
      active = false;
    };
  }, [contactsReloadToken, multiLineUi, salesLineId, lineReady]);

  useEffect(() => {
    let active = true;
    void fetchNeedsMappingCount().then((result) => {
      if (!active || result.error) return;
      setMessagesNeedsMappingCount(result.count);
    });
    return () => {
      active = false;
    };
  }, [activeTab]);

  function openModal(prospect?: Prospect) {
    if (!prospect && prospects.length === 0) return;
    const store = prospect ?? prospects[0];
    setModalStoreId(store ? store.id : null);
    setModalOpen(true);
  }

  if (multiLineUi && lineAccountId && lineAccountError) {
    return (
      <div className="bg-bg font-body text-ink mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-3 px-7">
        <h1 className="m-0 text-2xl">Account not found</h1>
        <p className="text-ink/70 m-0 text-sm">{lineAccountError}</p>
        <a
          href={lineSlug ? `/app/lines/${lineSlug}/accounts` : '/app'}
          className="font-heading text-accent-700 no-underline"
        >
          Back to accounts
        </a>
      </div>
    );
  }

  const headerSubtitle = multiLineUi
    ? lineCtx.name
      ? `Independent Sales Representative — ${lineCtx.name}`
      : 'Independent Sales Representative'
    : 'Independent Sales Representative — British Columbia';

  return (
    <div className="bg-bg font-body text-ink min-h-screen">
      <header className="border-ink/15 bg-bg/95 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto max-w-[1400px]">
          <Header
            activeLine={lineSlug ?? 'ogr'}
            onSelectOgr={() => {
              if (multiLineUi) navigateToLine('ogr');
            }}
            onLogCall={() => openModal()}
            onOpenMessages={() => setActiveTab('messages')}
            messagesNeedsMappingCount={messagesNeedsMappingCount}
            multiLineUi={multiLineUi}
            representedLines={lineCtx.representedLines}
            onSelectLine={navigateToLine}
            subtitle={headerSubtitle}
          />
          <TabNav
            activeTab={activeTab}
            onChange={setActiveTab}
            totalSkuCount={catalog.length}
            prospectTotalCount={pipelineProspects.length}
            accountTotalCount={activeAccounts.length}
            contactTotalCount={contacts.length}
            messagesNeedsMappingCount={messagesNeedsMappingCount}
          />
        </div>
      </header>

      <main
        key={multiLineUi ? (salesLineId ?? 'loading') : 'legacy'}
        className="mx-auto flex max-w-[1400px] flex-col gap-5 px-7 pt-6 pb-16"
      >
        {directoryLoading && (
          <p className="text-ink/60 m-0 text-sm">Loading catalog and prospect directory…</p>
        )}
        {directoryError && (
          <p className="text-accent-800 m-0 text-sm">
            Could not load directory data: {directoryError}
          </p>
        )}

        {!directoryLoading && (catalog.length > 0 || prospects.length > 0 || !directoryError) && (
          <>
            {activeTab === 'briefing' && (
              <AgentBriefingTab
                onOpenDraft={openDraftDeepLink}
                onOpenProspect={openProspectDeepLink}
              />
            )}
            {activeTab === 'catalog' && (
              <CatalogTab
                catalog={catalog}
                onCatalogChange={setCatalog}
                supplierTerms={supplierTerms}
                fx={fx}
                setFx={setFx}
                freightRate={freightRate}
                setFreightRate={setFreightRate}
                gstRate={gstRate}
                setGstRate={setGstRate}
                otherTaxRate={otherTaxRate}
                setOtherTaxRate={setOtherTaxRate}
                factors={factors}
                researchBrief={researchBrief}
                setResearchBrief={setResearchBrief}
                ratesAsOf={ratesAsOf}
                setRatesAsOf={setRatesAsOf}
                keystoneMarginRate={keystoneMarginRate}
                setKeystoneMarginRate={setKeystoneMarginRate}
                marginRangeDisplay={marginRangeDisplay}
                deepLinkSku={deepLinkSku}
                deepLinkDraftId={deepLinkDraftId}
                onDeepLinkConsumed={clearCatalogDeepLink}
              />
            )}
            {activeTab === 'dashboard' && (
              <DashboardTab
                prospects={prospects}
                onLogCall={() => openModal()}
                reloadToken={callsReloadToken}
              />
            )}
            {activeTab === 'calls' && (
              <CallsTab
                prospects={prospects}
                onLogCall={() => openModal()}
                reloadToken={callsReloadToken}
              />
            )}
            {activeTab === 'prospects' && (
              <ProspectsTab
                prospects={pipelineProspects}
                territories={territories}
                onLogCall={(prospect) => openModal(prospect)}
                onConverted={reloadDirectory}
                onProspectCreated={(prospect) => {
                  setProspects((prev) =>
                    [...prev.filter((p) => p.id !== prospect.id), prospect].sort(
                      (a, b) => a.id - b.id,
                    ),
                  );
                }}
                onProspectUpdated={(prospect) => {
                  setProspects((prev) => prev.map((p) => (p.id === prospect.id ? prospect : p)));
                }}
                onNotesSaved={(id, notes) => {
                  setProspects((prev) => prev.map((p) => (p.id === id ? { ...p, notes } : p)));
                }}
                deepLinkProspectId={deepLinkProspectId}
                onDeepLinkConsumed={clearProspectDeepLink}
              />
            )}
            {activeTab === 'accounts' && (
              <ActiveAccountsTab
                accounts={activeAccounts}
                territories={territories}
                onLogCall={(account) => openModal(account)}
                onNotesSaved={(id, notes) => {
                  setProspects((prev) => prev.map((p) => (p.id === id ? { ...p, notes } : p)));
                }}
                onProspectUpdated={(prospect) => {
                  setProspects((prev) => prev.map((p) => (p.id === prospect.id ? prospect : p)));
                }}
                deepLinkAccountId={deepLinkAccountId}
                onDeepLinkConsumed={clearAccountDeepLink}
              />
            )}
            {activeTab === 'contacts' && (
              <ContactsTab
                contacts={contacts}
                prospects={prospects}
                onLogCall={(store) => openModal(store)}
                onNotesSaved={(id, notes) => {
                  setProspects((prev) => prev.map((p) => (p.id === id ? { ...p, notes } : p)));
                }}
                onReloadContacts={reloadContacts}
                onProspectCreated={(prospect) => {
                  setProspects((prev) =>
                    [...prev.filter((p) => p.id !== prospect.id), prospect].sort(
                      (a, b) => a.id - b.id,
                    ),
                  );
                }}
              />
            )}
            {activeTab === 'messages' && (
              <MessagesTab
                reloadToken={messagesReloadToken}
                onNeedsMappingCountChange={setMessagesNeedsMappingCount}
                onOpenLiveChat={openLiveChat}
                onSurfaceLiveChatPill={surfaceLiveChatPill}
                onLogCall={(store) => openModal(store)}
                onNotesSaved={(id, notes) => {
                  setProspects((prev) => prev.map((p) => (p.id === id ? { ...p, notes } : p)));
                }}
              />
            )}
            {activeTab === 'calendar' && <CalendarTab />}
            {activeTab === 'insights' && (
              <InsightsTab marginRangeDisplay={marginRangeDisplay} reloadToken={callsReloadToken} />
            )}
          </>
        )}
      </main>

      <LogCallModal
        open={modalOpen}
        prospects={prospects}
        storeId={modalStoreId}
        catalog={catalog}
        onClose={() => setModalOpen(false)}
        onStoreChange={(id) => setModalStoreId(id)}
        onSaved={() => setCallsReloadToken((n) => n + 1)}
        onConverted={reloadDirectory}
      />

      <StaffChatDock
        openChats={openLiveChats}
        onChange={setOpenLiveChats}
        onReplySent={() => setMessagesReloadToken((n) => n + 1)}
      />
    </div>
  );
}
