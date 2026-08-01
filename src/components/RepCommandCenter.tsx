import { useState } from 'react';
import { Header } from '@/components/Header';
import { TabNav } from '@/components/TabNav';
import { LogCallModal } from '@/components/LogCallModal';
import { CatalogTab } from '@/components/tabs/CatalogTab';
import { DashboardTab } from '@/components/tabs/DashboardTab';
import { CallsTab } from '@/components/tabs/CallsTab';
import { ProspectsTab } from '@/components/tabs/ProspectsTab';
import { InsightsTab } from '@/components/tabs/InsightsTab';
import { useLandedCostCalculator } from '@/hooks/useLandedCostCalculator';
import { CATALOG_DATA } from '@/data/catalog';
import { PROSPECTS_DATA, type Prospect } from '@/data/prospects';
import type { TabKey } from '@/types';

interface RepCommandCenterProps {
  defaultTab?: TabKey;
}

export function RepCommandCenter({ defaultTab = 'catalog' }: RepCommandCenterProps) {
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStoreId, setModalStoreId] = useState<number | null>(null);

  const { fx, setFx, freight, setFreight, marginRangeDisplay } = useLandedCostCalculator();

  function openModal(prospect?: Prospect) {
    const store = prospect ?? PROSPECTS_DATA[0];
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
            totalSkuCount={CATALOG_DATA.length}
            prospectTotalCount={PROSPECTS_DATA.length}
          />
        </div>
      </header>

      <main className="mx-auto flex max-w-[1400px] flex-col gap-5 px-7 pb-16 pt-6">
        {activeTab === 'catalog' && (
          <CatalogTab fx={fx} setFx={setFx} freight={freight} setFreight={setFreight} marginRangeDisplay={marginRangeDisplay} />
        )}
        {activeTab === 'dashboard' && <DashboardTab onLogCall={() => openModal()} />}
        {activeTab === 'calls' && <CallsTab onLogCall={() => openModal()} />}
        {activeTab === 'prospects' && <ProspectsTab onLogCall={(prospect) => openModal(prospect)} />}
        {activeTab === 'insights' && <InsightsTab marginRangeDisplay={marginRangeDisplay} />}
      </main>

      <LogCallModal
        open={modalOpen}
        storeId={modalStoreId}
        onClose={() => setModalOpen(false)}
        onStoreChange={(id) => setModalStoreId(id)}
      />
    </div>
  );
}
