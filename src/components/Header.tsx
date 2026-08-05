import { Download, MessageSquare, PhoneCall } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { cn } from '@/lib/cn';
import type { LineKey } from '@/types';

interface HeaderProps {
  activeLine: LineKey;
  onSelectOgr: () => void;
  onLogCall: () => void;
  onOpenMessages: () => void;
  messagesNeedsMappingCount?: number;
}

export function Header({
  activeLine,
  onSelectOgr,
  onLogCall,
  onOpenMessages,
  messagesNeedsMappingCount = 0,
}: HeaderProps) {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-7 py-3.5">
      <div className="gap-3.1 flex items-center">
        <div className="bg-accent font-heading text-bg flex h-[46px] w-[46px] flex-none items-center justify-center rounded-full text-lg">
          JF
        </div>
        <div>
          <h1 className="m-0 text-xl">Justin Fassio</h1>
          <p className="text-accent-700 mt-0.5 mb-0 text-xs font-semibold">
            Independent Sales Representative — British Columbia
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="bg-surface flex items-center gap-2 rounded-full p-1">
          <button
            onClick={onSelectOgr}
            className={cn(
              'font-heading inline-flex items-center rounded-full px-3.5 py-1.5 text-sm',
              activeLine === 'ogr' ? 'bg-accent text-bg' : 'text-ink/70 bg-transparent',
            )}
          >
            Old Guys Rule
          </button>
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
