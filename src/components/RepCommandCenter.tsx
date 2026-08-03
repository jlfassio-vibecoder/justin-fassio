import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { TabNav } from '@/components/TabNav';
import { LogCallModal } from '@/components/LogCallModal';
import { CatalogTab } from '@/components/tabs/CatalogTab';
import { DashboardTab } from '@/components/tabs/DashboardTab';
import { CallsTab } from '@/components/tabs/CallsTab';
import { ProspectsTab } from '@/components/tabs/ProspectsTab';
import { InsightsTab } from '@/components/tabs/InsightsTab';
import { useLandedCostCalculator } from '@/hooks/useLandedCostCalculator';
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
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  const { fx, setFx, freight, setFreight, marginRangeDisplay } = useLandedCostCalculator(catalog);

  useEffect(() => {
    let active = true;

    async function load() {
      setDirectoryLoading(true);
      setDirectoryError(null);
      const [catalogResult, prospectsResult] = await Promise.all([
        fetchCatalogItems(),
        fetchProspects(),
      ]);

      if (!active) return;

      const errors = [catalogResult.error, prospectsResult.error].filter(Boolean);
      if (errors.length) {
        setCatalog([]);
        setProspects([]);
        setDirectoryError(errors.join(' · '));
        setDirectoryLoading(false);
        return;
      }

      setCatalog(catalogResult.data);
      setProspects(prospectsResult.data);
      setDirectoryLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  function openModal(prospect?: Prospect) {
    if (!prospect && prospects.length === 0) return;
    const store = prospect ?? prospects[0];
    setModalStoreId(store ? store.id : null);
    setModalOpen(true);
  }

  return (
    <div className="min-h-screen bg-bg font-body text-ink">
      <header className="sticky top-0 z-30 border-b border-ink/15 bg-bg/95 backdrop-blur">
        <div className="mx-auto max-w-[1400px]">
          <Header activeLine="ogr" onSelectOgr={() => {}} onLogCall={() => openModal()} />
          <TabNav
            activeTab={activeTab}
            onChange={setActiveTab}
            totalSkuCount={catalog.length}
            prospectTotalCount={prospects.length}
          />
        </div>
      </header>

      <main className="mx-auto flex max-w-[1400px] flex-col gap-5 px-7 pb-16 pt-6">
        {directoryLoading && (
          <p className="m-0 text-sm text-ink/60">Loading catalog and prospect directory…</p>
        )}
        {directoryError && (
          <p className="m-0 text-sm text-accent-800">
            Could not load directory data: {directoryError}
          </p>
        )}

        {!directoryLoading && !directoryError && (
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
              <ProspectsTab prospects={prospects} onLogCall={(prospect) => openModal(prospect)} />
            )}
            {activeTab === 'insights' && (
              <InsightsTab
                marginRangeDisplay={marginRangeDisplay}
                reloadToken={callsReloadToken}
              />
            )}
          </>
        )}
      </main>

      <LogCallModal
        open={modalOpen}
        prospects={prospects}
        storeId={modalStoreId}
        onClose={() => setModalOpen(false)}
        onStoreChange={(id) => setModalStoreId(id)}
        onSaved={() => setCallsReloadToken((n) => n + 1)}
      />
    </div>
  );
}
