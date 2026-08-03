import { useState } from 'react';
import { X } from 'lucide-react';
import { ConvertAccountModal } from '@/components/ConvertAccountModal';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import type { Prospect } from '@/lib/prospects';

interface ProspectDetailDrawerProps {
  prospect: Prospect | null;
  onClose: () => void;
  onLogCall: (prospect: Prospect) => void;
  onConverted?: () => void;
}

const STATUS_LABEL: Record<Prospect['accountStatus'], string> = {
  prospect: 'Prospect',
  active_account: 'Active account',
  inactive: 'Inactive',
};

export function ProspectDetailDrawer({
  prospect,
  onClose,
  onLogCall,
  onConverted,
}: ProspectDetailDrawerProps) {
  const [convertOpen, setConvertOpen] = useState(false);

  if (!prospect) return null;

  const canConvert =
    prospect.accountStatus !== 'active_account' && prospect.accountStatus !== 'inactive';

  return (
    <>
      <div className="fixed inset-0 z-40 bg-neutral-900/40" onClick={onClose} aria-hidden="true" />
      <aside
        className="border-ink/15 bg-surface fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prospect-detail-title"
      >
        <div className="border-ink/10 flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <p id="prospect-detail-title" className="font-heading text-xl leading-tight">
              {prospect.name}
            </p>
            <p className="text-ink/60 m-0 mt-1 text-xs tracking-wide uppercase">
              #{prospect.id} · {STATUS_LABEL[prospect.accountStatus]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-transparent"
            aria-label="Close"
          >
            <X size={18} strokeWidth={2.75} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Tag variant="accent-2">{prospect.category}</Tag>
            <span className="text-ink/70 text-sm">
              {prospect.city} ({prospect.region})
            </span>
          </div>

          <dl className="m-0 grid gap-3 text-sm">
            <div>
              <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">Phone</dt>
              <dd className="m-0 mt-0.5">{prospect.phone || '—'}</dd>
            </div>
            <div>
              <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">Address</dt>
              <dd className="m-0 mt-0.5">{prospect.address || '—'}</dd>
            </div>
            <div>
              <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">Fit reason</dt>
              <dd className="text-ink/80 m-0 mt-0.5 leading-relaxed">{prospect.fit || '—'}</dd>
            </div>
          </dl>
        </div>

        <div className="border-ink/10 flex flex-col gap-2 border-t px-5 py-4">
          {canConvert ? (
            <Button variant="primary" onClick={() => setConvertOpen(true)}>
              Convert to Active Account
            </Button>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => {
              onLogCall(prospect);
              onClose();
            }}
          >
            Log Call
          </Button>
        </div>
      </aside>

      <ConvertAccountModal
        open={convertOpen}
        prospect={prospect}
        onClose={() => setConvertOpen(false)}
        onConverted={() => {
          setConvertOpen(false);
          onConverted?.();
          onClose();
        }}
      />
    </>
  );
}
