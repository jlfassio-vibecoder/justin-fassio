import { Building2, Gauge, Home, Lightbulb, ListChecks, Package, Users } from 'lucide-react';
import { Tag } from '@/components/ui/Tag';
import { cn } from '@/lib/cn';
import type { TabKey } from '@/types';

interface TabNavProps {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
  totalSkuCount: number;
  prospectTotalCount: number;
  accountTotalCount: number;
  contactTotalCount: number;
}

const tabs: { key: TabKey; label: string; icon: typeof Package }[] = [
  { key: 'catalog', label: 'Line Sheet', icon: Package },
  { key: 'dashboard', label: 'PMF Dashboard', icon: Gauge },
  { key: 'calls', label: 'Call Pipeline', icon: ListChecks },
  { key: 'prospects', label: 'BC Prospect Directory', icon: Home },
  { key: 'accounts', label: 'Active Accounts', icon: Building2 },
  { key: 'contacts', label: 'Contacts', icon: Users },
  { key: 'insights', label: 'Buyer Insights', icon: Lightbulb },
];

export function TabNav({
  activeTab,
  onChange,
  totalSkuCount,
  prospectTotalCount,
  accountTotalCount,
  contactTotalCount,
}: TabNavProps) {
  return (
    <nav className="mx-auto flex max-w-[1400px] flex-wrap gap-2 px-7 pb-3.5">
      {tabs.map(({ key, label, icon: Icon }) => {
        const active = activeTab === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            data-screen-label={`tab-${key}`}
            className={cn(
              'font-heading inline-flex cursor-pointer items-center gap-1.5 rounded-full border-none px-4 py-2 text-sm',
              active ? 'bg-accent text-bg' : 'text-ink bg-transparent',
            )}
          >
            <Icon size={16} strokeWidth={2.75} />
            <span>{label}</span>
            {key === 'catalog' && <Tag variant="accent">{totalSkuCount}</Tag>}
            {key === 'prospects' && <Tag variant="accent-2">{prospectTotalCount}</Tag>}
            {key === 'accounts' && <Tag variant="accent">{accountTotalCount}</Tag>}
            {key === 'contacts' && <Tag variant="accent-2">{contactTotalCount}</Tag>}
          </button>
        );
      })}
    </nav>
  );
}
