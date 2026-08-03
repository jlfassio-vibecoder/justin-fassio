import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { ProspectDetailDrawer } from '@/components/ProspectDetailDrawer';
import { RetailerDirectory } from '@/components/directory/RetailerDirectory';
import { Button } from '@/components/ui/Button';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import type { Prospect } from '@/lib/prospects';
import { suggestFollowUps } from '@/lib/suggestFollowUps';

interface ProspectsTabProps {
  prospects: Prospect[];
  onLogCall: (prospect: Prospect) => void;
  onConverted?: () => void;
}

type SuggestState = {
  prospectName: string;
  summary: string;
  followUps: string[];
} | null;

export function ProspectsTab({ prospects, onLogCall, onConverted }: ProspectsTabProps) {
  const [suggestBusyId, setSuggestBusyId] = useState<number | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestResult, setSuggestResult] = useState<SuggestState>(null);
  const [detailProspect, setDetailProspect] = useState<Prospect | null>(null);

  const pipelineProspects = useMemo(
    () => prospects.filter((p) => p.accountStatus !== 'active_account'),
    [prospects],
  );

  async function handleSuggest(prospect: Prospect) {
    setSuggestError(null);
    setSuggestBusyId(prospect.id);
    const result = await suggestFollowUps(prospect.id);
    setSuggestBusyId(null);
    if (!result.ok) {
      setSuggestError(`${prospect.name}: ${result.error}`);
      return;
    }
    setSuggestResult({
      prospectName: prospect.name,
      summary: result.summary,
      followUps: result.followUps,
    });
  }

  return (
    <>
      <RetailerDirectory
        data-screen-label="prospects"
        retailers={pipelineProspects}
        searchPlaceholder="Search BC prospects by name, city, address, or fit reason…"
        emptyMessage="No prospects match these filters. Converted accounts live under Active Accounts."
        banner={
          suggestError ? (
            <p className="text-sm text-red-700" role="alert">
              {suggestError}
            </p>
          ) : null
        }
        renderActions={(p) => (
          <>
            <Button
              variant="secondary"
              className="px-3 py-1 text-xs"
              onClick={() => setDetailProspect(p)}
            >
              Details
            </Button>
            <Button
              variant="secondary"
              className="px-3 py-1 text-xs"
              disabled={suggestBusyId === p.id}
              onClick={() => void handleSuggest(p)}
            >
              {suggestBusyId === p.id ? 'Suggest…' : 'Suggest'}
            </Button>
            <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => onLogCall(p)}>
              Log Call
            </Button>
          </>
        )}
      />

      <DialogBackdrop open={suggestResult != null} onClose={() => setSuggestResult(null)}>
        {suggestResult ? (
          <div className="bg-surface p-4.1 flex max-w-[560px] flex-col gap-3 rounded-xl shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle>Follow-ups · {suggestResult.prospectName}</DialogTitle>
              <button
                type="button"
                onClick={() => setSuggestResult(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-transparent"
                aria-label="Close"
              >
                <X size={18} strokeWidth={2.75} />
              </button>
            </div>
            <p className="text-ink/85 text-sm leading-relaxed">{suggestResult.summary}</p>
            {suggestResult.followUps.length > 0 ? (
              <ol className="text-ink/85 list-decimal space-y-1.5 pl-5 text-sm">
                {suggestResult.followUps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            ) : null}
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setSuggestResult(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </DialogBackdrop>

      <ProspectDetailDrawer
        prospect={detailProspect}
        onClose={() => setDetailProspect(null)}
        onLogCall={onLogCall}
        onConverted={onConverted}
      />
    </>
  );
}
