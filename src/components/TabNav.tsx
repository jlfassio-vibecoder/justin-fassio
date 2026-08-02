import { Gauge, Home, Lightbulb, ListChecks, Package } from 'lucide-react';
import { Tag } from '@/components/ui/Tag';
import { cn } from '@/lib/cn';
import type { TabKey } from '@/types';

interface TabNavProps {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
  totalSkuCount: number;
  prospectTotalCount: number;
}

const tabs: { key: TabKey; label: string; icon: typeof Package }[] = [
  { key: 'catalog', label: 'Line Sheet', icon: Package },
  { key: 'dashboard', label: 'PMF Dashboard', icon: Gauge },
  { key: 'calls', label: 'Call Pipeline', icon: ListChecks },
  { key: 'prospects', label: 'BC Prospect Directory', icon: Home },
  { key: 'insights', label: 'Buyer Insights', icon: Lightbulb },
];

export function TabNav({ activeTab, onChange, totalSkuCount, prospectTotalCount }: TabNavProps) {
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
              'inline-flex cursor-pointer items-center gap-1.5 rounded-full border-none px-4 py-2 font-heading text-sm',
              active ? 'bg-accent text-bg' : 'bg-transparent text-ink',
            )}
          >
            <Icon size={16} strokeWidth={2.75} />
            <span>{label}</span>
            {key === 'catalog' && <Tag variant="accent">{totalSkuCount}</Tag>}
            {key === 'prospects' && <Tag variant="accent-2">{prospectTotalCount}</Tag>}
          </button>
        );
      })}
    </nav>
  );
}
