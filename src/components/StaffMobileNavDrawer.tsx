import { useEffect, useRef } from 'react';
import { Download, MapPin, MessageSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { cn } from '@/lib/cn';
import { lineStatusBadgeLabel } from '@/lib/lineContextStorage';
import type { LinePortfolio } from '@/lib/lines';
import { STAFF_TABS } from '@/lib/staffTabs';
import type { LineKey, TabKey } from '@/types';

export type StaffMobileNavDrawerProps = {
  open: boolean;
  onClose: () => void;
  activeLine: LineKey;
  multiLineUi?: boolean;
  representedLines?: LinePortfolio[];
  onSelectLine?: (slug: LineKey) => void;
  onSelectOgr?: () => void;
  territoriesHref?: string;
  activeTab: TabKey;
  onChangeTab: (tab: TabKey) => void;
  totalSkuCount: number;
  prospectTotalCount: number;
  accountTotalCount: number;
  contactTotalCount: number;
  messagesNeedsMappingCount?: number;
  onOpenMessages: () => void;
};

export function StaffMobileNavDrawer({
  open,
  onClose,
  activeLine,
  multiLineUi = false,
  representedLines = [],
  onSelectLine,
  onSelectOgr,
  territoriesHref,
  activeTab,
  onChangeTab,
  totalSkuCount,
  prospectTotalCount,
  accountTotalCount,
  contactTotalCount,
  messagesNeedsMappingCount = 0,
  onOpenMessages,
}: StaffMobileNavDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function selectLine(slug: LineKey) {
    onSelectLine?.(slug);
    onClose();
  }

  function selectTab(tab: TabKey) {
    onChangeTab(tab);
    onClose();
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-neutral-900/40 md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="border-ink/15 bg-surface fixed inset-y-0 left-0 z-50 flex w-[min(100%,20rem)] flex-col border-r shadow-xl md:hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-mobile-nav-title"
      >
        <div className="border-ink/10 flex items-start justify-between gap-3 border-b px-4 py-3.5">
          <div className="min-w-0">
            <p id="staff-mobile-nav-title" className="font-heading m-0 text-lg leading-tight">
              Navigation
            </p>
            <p className="text-ink/55 m-0 mt-0.5 text-xs">Lines and tabs</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-transparent"
            aria-label="Close navigation"
          >
            <X size={18} strokeWidth={2.75} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
          <section aria-label="Sales lines">
            <p className="text-ink/55 m-0 mb-2 text-[11px] tracking-wide uppercase">Lines</p>
            <div className="bg-bg flex flex-col gap-1.5 rounded-xl p-1.5">
              {multiLineUi && representedLines.length > 0 ? (
                representedLines.map((line) => {
                  const slug = line.code as LineKey;
                  const selected = activeLine === slug;
                  return (
                    <button
                      key={line.id}
                      type="button"
                      onClick={() => selectLine(slug)}
                      className={cn(
                        'font-heading inline-flex items-center justify-between gap-2 rounded-full px-3.5 py-2 text-left text-sm',
                        selected ? 'bg-accent text-on-accent' : 'text-ink/70 bg-transparent',
                      )}
                    >
                      <span className="min-w-0 truncate">{line.name}</span>
                      {selected ? (
                        <span className="bg-bg/20 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] tracking-wide">
                          {lineStatusBadgeLabel(line.status)}
                        </span>
                      ) : null}
                    </button>
                  );
                })
              ) : multiLineUi ? (
                <span className="text-ink/50 px-3.5 py-2 text-sm">Loading lines…</span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onSelectOgr?.();
                    onClose();
                  }}
                  className={cn(
                    'font-heading inline-flex items-center rounded-full px-3.5 py-2 text-sm',
                    activeLine === 'ogr'
                      ? 'bg-accent text-on-accent'
                      : 'text-ink/70 bg-transparent',
                  )}
                >
                  Old Guys Rule
                </button>
              )}
            </div>
            {territoriesHref ? (
              <a
                href={territoriesHref}
                className="font-heading text-ink/70 mt-2 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm no-underline"
                onClick={onClose}
              >
                <MapPin size={16} strokeWidth={2.75} />
                <span>Territories</span>
              </a>
            ) : null}
          </section>

          <section aria-label="App tabs">
            <p className="text-ink/55 m-0 mb-2 text-[11px] tracking-wide uppercase">Navigate</p>
            <nav className="flex flex-col gap-1">
              {STAFF_TABS.map(({ key, label, icon: Icon }) => {
                const active = activeTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => selectTab(key)}
                    data-screen-label={`mobile-tab-${key}`}
                    className={cn(
                      'font-heading inline-flex cursor-pointer items-center gap-2 rounded-full border-none px-3.5 py-2.5 text-left text-sm',
                      active ? 'bg-accent text-on-accent' : 'text-ink bg-transparent',
                    )}
                  >
                    <Icon size={16} strokeWidth={2.75} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
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
          </section>

          <section className="border-ink/10 mt-auto flex flex-col gap-2 border-t pt-4">
            <button
              type="button"
              onClick={() => {
                onOpenMessages();
                onClose();
              }}
              className="font-heading text-ink/70 inline-flex items-center gap-2 rounded-full px-3.5 py-2.5 text-left text-sm"
              aria-label="Messages"
            >
              <MessageSquare size={16} strokeWidth={2.75} />
              <span>Messages</span>
              {messagesNeedsMappingCount > 0 ? (
                <Tag variant="accent">{messagesNeedsMappingCount}</Tag>
              ) : null}
            </button>
            <Button variant="secondary" className="justify-start">
              <Download size={16} strokeWidth={2.75} />
              <span>Export CSV</span>
            </Button>
          </section>
        </div>
      </aside>
    </>
  );
}
