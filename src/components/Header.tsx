import { Download, MapPin, MessageSquare, PhoneCall } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { cn } from '@/lib/cn';
import { lineStatusBadgeLabel } from '@/lib/lineContextStorage';
import type { LinePortfolio } from '@/lib/lines';
import type { LineKey } from '@/types';

interface HeaderProps {
  activeLine: LineKey;
  onSelectOgr: () => void;
  onLogCall: () => void;
  onOpenMessages: () => void;
  messagesNeedsMappingCount?: number;
  /** Phase 2: when set, show represented-line picker. */
  multiLineUi?: boolean;
  representedLines?: LinePortfolio[];
  onSelectLine?: (slug: LineKey) => void;
  subtitle?: string;
  /** Phase 5: line-rights admin page for the current represented line. */
  territoriesHref?: string;
}

export function Header({
  activeLine,
  onSelectOgr,
  onLogCall,
  onOpenMessages,
  messagesNeedsMappingCount = 0,
  multiLineUi = false,
  representedLines = [],
  onSelectLine,
  subtitle = 'Independent Sales Representative — British Columbia',
  territoriesHref,
}: HeaderProps) {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-7 py-3.5">
      <div className="gap-3.1 flex items-center">
        <div className="bg-accent font-heading text-bg flex h-[46px] w-[46px] flex-none items-center justify-center rounded-full text-lg">
          JF
        </div>
        <div>
          <h1 className="m-0 text-xl">Justin Fassio</h1>
          <p className="text-accent-700 mt-0.5 mb-0 text-xs font-semibold">{subtitle}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="bg-surface flex items-center gap-2 rounded-full p-1">
          {multiLineUi && representedLines.length > 0 ? (
            representedLines.map((line) => {
              const slug = line.code as LineKey;
              const selected = activeLine === slug;
              return (
                <button
                  key={line.id}
                  type="button"
                  onClick={() => onSelectLine?.(slug)}
                  className={cn(
                    'font-heading inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm',
                    selected ? 'bg-accent text-bg' : 'text-ink/70 bg-transparent',
                  )}
                >
                  <span>{line.name}</span>
                  {selected ? (
                    <span className="bg-bg/20 rounded-full px-1.5 py-0.5 text-[10px] tracking-wide">
                      {lineStatusBadgeLabel(line.status)}
                    </span>
                  ) : null}
                </button>
              );
            })
          ) : multiLineUi ? (
            <span className="text-ink/50 px-3.5 py-1.5 text-sm">Loading lines…</span>
          ) : (
            <button
              onClick={onSelectOgr}
              className={cn(
                'font-heading inline-flex items-center rounded-full px-3.5 py-1.5 text-sm',
                activeLine === 'ogr' ? 'bg-accent text-bg' : 'text-ink/70 bg-transparent',
              )}
            >
              Old Guys Rule
            </button>
          )}
          {territoriesHref ? (
            <a
              href={territoriesHref}
              className="font-heading text-ink/70 inline-flex items-center gap-1.5 rounded-full bg-transparent px-3.5 py-1.5 text-sm no-underline"
            >
              <MapPin size={16} strokeWidth={2.75} />
              <span>Territories</span>
            </a>
          ) : null}
          <button
            type="button"
            onClick={onOpenMessages}
            className="font-heading text-ink/70 inline-flex items-center gap-1.5 rounded-full bg-transparent px-3.5 py-1.5 text-sm"
            aria-label="Messages"
          >
            <MessageSquare size={16} strokeWidth={2.75} />
            <span>Messages</span>
            {messagesNeedsMappingCount > 0 ? (
              <Tag variant="accent" className="ml-0.5">
                {messagesNeedsMappingCount}
              </Tag>
            ) : null}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <Button variant="primary" onClick={onLogCall}>
          <PhoneCall size={16} strokeWidth={2.75} />
          <span>Log Call</span>
        </Button>
        <Button variant="secondary">
          <Download size={16} strokeWidth={2.75} />
          <span>Export CSV</span>
        </Button>
      </div>
    </div>
  );
}
