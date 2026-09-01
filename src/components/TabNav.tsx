import { Tag } from '@/components/ui/Tag';
import { cn } from '@/lib/cn';
import { STAFF_TABS } from '@/lib/staffTabs';
import type { TabKey } from '@/types';

interface TabNavProps {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
  totalSkuCount: number;
  prospectTotalCount: number;
  accountTotalCount: number;
  contactTotalCount: number;
  messagesNeedsMappingCount?: number;
}

export function TabNav({
  activeTab,
  onChange,
  totalSkuCount,
  prospectTotalCount,
  accountTotalCount,
  contactTotalCount,
  messagesNeedsMappingCount = 0,
}: TabNavProps) {
  return (
    <nav className="mx-auto flex max-w-[1400px] flex-wrap gap-2 px-7 pb-3.5">
      {STAFF_TABS.map(({ key, label, icon: Icon }) => {
        const active = activeTab === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            data-screen-label={`tab-${key}`}
            className={cn(
              'font-heading inline-flex cursor-pointer items-center gap-1.5 rounded-full border-none px-4 py-2 text-sm',
              active ? 'bg-accent text-on-accent' : 'text-ink bg-transparent',
            )}
          >
            <Icon size={16} strokeWidth={2.75} />
            <span>{label}</span>
            {key === 'catalog' && <Tag variant="accent">{totalSkuCount}</Tag>}
            {key === 'prospects' && <Tag variant="accent-2">{prospectTotalCount}</Tag>}
            {key === 'accounts' && <Tag variant="accent">{accountTotalCount}</Tag>}
            {key === 'contacts' && <Tag variant="accent-2">{contactTotalCount}</Tag>}
            {key === 'messages' && messagesNeedsMappingCount > 0 && (
              <Tag variant="accent">{messagesNeedsMappingCount}</Tag>
            )}
          </button>
        );
      })}
    </nav>
  );
}
