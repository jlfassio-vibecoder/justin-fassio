import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/Header';
import { TabNav } from '@/components/TabNav';
import { LogCallModal } from '@/components/LogCallModal';
import { CatalogTab } from '@/components/tabs/CatalogTab';
import { DashboardTab } from '@/components/tabs/DashboardTab';
import { CallsTab } from '@/components/tabs/CallsTab';
import { ProspectsTab } from '@/components/tabs/ProspectsTab';
import { ActiveAccountsTab } from '@/components/tabs/ActiveAccountsTab';
import { ContactsTab } from '@/components/tabs/ContactsTab';
import { InsightsTab } from '@/components/tabs/InsightsTab';
import { useLandedCostCalculator } from '@/hooks/useLandedCostCalculator';
import { fetchAllContacts, type ContactDirectoryRow } from '@/lib/accountContacts';
import { fetchCatalogItems, type CatalogItem } from '@/lib/catalog';
import { fetchProspects, type Prospect } from '@/lib/prospects';
import type { TabKey } from '@/types';

interface RepCommandCenterProps {
  defaultTab?: TabKey;
}

export function RepCommandCenter({ defaultTab = 'catalog' }: RepCommandCenterProps) {
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStoreId, setModalStoreId] = useState<number | null>(null);
  const [callsReloadToken, setCallsReloadToken] = useState(0);
  const [directoryReloadToken, setDirectoryReloadToken] = useState(0);
  const [contactsReloadToken, setContactsReloadToken] = useState(0);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [contacts, setContacts] = useState<ContactDirectoryRow[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  const { fx, setFx, freight, setFreight, marginRangeDisplay } = useLandedCostCalculator(catalog);

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

  useEffect(() => {
    let active = true;
    const isInitial = directoryReloadToken === 0;

    async function load() {
      if (isInitial) {
        setDirectoryLoading(true);
      }
      setDirectoryError(null);
      const [catalogResult, prospectsResult, contactsResult] = await Promise.all([
        fetchCatalogItems(),
        fetchProspects(),
        fetchAllContacts(),
      ]);

      if (!active) return;

      const errors = [catalogResult.error, prospectsResult.error, contactsResult.error].filter(
        Boolean,
      );
      if (errors.length) {
        if (isInitial) {
          setCatalog([]);
          setProspects([]);
          setContacts([]);
        }
        setDirectoryError(errors.join(' · '));
        setDirectoryLoading(false);
        return;
      }

      setCatalog(catalogResult.data);
      setProspects(prospectsResult.data);
      setContacts(contactsResult.data);
      setDirectoryLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [directoryReloadToken]);

  useEffect(() => {
    if (contactsReloadToken === 0) return;
    let active = true;
    void fetchAllContacts().then((result) => {
      if (!active) return;
      if (result.error) return;
      setContacts(result.data);
    });
    return () => {
      active = false;
    };
  }, [contactsReloadToken]);

  function openModal(prospect?: Prospect) {
    if (!prospect && prospects.length === 0) return;
    const store = prospect ?? prospects[0];
    setModalStoreId(store ? store.id : null);
    setModalOpen(true);
  }

  return (
    <div className="bg-bg font-body text-ink min-h-screen">
      <header className="border-ink/15 bg-bg/95 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto max-w-[1400px]">
          <Header activeLine="ogr" onSelectOgr={() => {}} onLogCall={() => openModal()} />
          <TabNav
            activeTab={activeTab}
            onChange={setActiveTab}
            totalSkuCount={catalog.length}
            prospectTotalCount={pipelineProspects.length}
            accountTotalCount={activeAccounts.length}
            contactTotalCount={contacts.length}
          />
        </div>
      </header>

      <main className="mx-auto flex max-w-[1400px] flex-col gap-5 px-7 pt-6 pb-16">
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
            {activeTab === 'catalog' && (
              <CatalogTab
                catalog={catalog}
                fx={fx}
                setFx={setFx}
                freight={freight}
                setFreight={setFreight}
                marginRangeDisplay={marginRangeDisplay}
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
                onLogCall={(prospect) => openModal(prospect)}
                onConverted={reloadDirectory}
                onProspectCreated={(prospect) => {
                  setProspects((prev) =>
                    [...prev.filter((p) => p.id !== prospect.id), prospect].sort(
                      (a, b) => a.id - b.id,
                    ),
                  );
                }}
                onNotesSaved={(id, notes) => {
                  setProspects((prev) => prev.map((p) => (p.id === id ? { ...p, notes } : p)));
                }}
              />
            )}
            {activeTab === 'accounts' && (
              <ActiveAccountsTab
                accounts={activeAccounts}
                onLogCall={(account) => openModal(account)}
                onNotesSaved={(id, notes) => {
                  setProspects((prev) => prev.map((p) => (p.id === id ? { ...p, notes } : p)));
                }}
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
              />
            )}
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
    </div>
  );
}
