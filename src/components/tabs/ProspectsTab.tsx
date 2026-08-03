import { useEffect, useMemo, useState } from 'react';
import { AddProspectAiModal } from '@/components/AddProspectAiModal';
import { ProspectDetailDrawer } from '@/components/ProspectDetailDrawer';
import { RetailerDirectory } from '@/components/directory/RetailerDirectory';
import { Button } from '@/components/ui/Button';
import { useAiAssist } from '@/hooks/useAiAssist';
import { buildApfDraft, buildAssistDraft, buildSuggestDraft } from '@/lib/aiAssistPrefill';
import type { Prospect } from '@/lib/prospects';

interface ProspectsTabProps {
  prospects: Prospect[];
  onLogCall: (prospect: Prospect) => void;
  onConverted?: () => void;
  onProspectCreated?: (prospect: Prospect) => void;
  onNotesSaved?: (id: number, notes: string | null) => void;
}

export function ProspectsTab({
  prospects,
  onLogCall,
  onConverted,
  onProspectCreated,
  onNotesSaved,
}: ProspectsTabProps) {
  const { openAssist } = useAiAssist();
  const [addOpen, setAddOpen] = useState(false);
  const [highlightedProspectId, setHighlightedProspectId] = useState<number | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [detailProspect, setDetailProspect] = useState<Prospect | null>(null);

  const pipelineProspects = useMemo(
    () => prospects.filter((p) => p.accountStatus !== 'active_account'),
    [prospects],
  );

  useEffect(() => {
    if (highlightedProspectId == null) return;
    const timer = window.setTimeout(() => {
      setHighlightedProspectId(null);
      setSuccessBanner(null);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [highlightedProspectId]);

  function handleCreated(prospect: Prospect) {
    onProspectCreated?.(prospect);
    setHighlightedProspectId(prospect.id);
    setSuccessBanner(`Added ${prospect.name} (#${prospect.id})`);
  }

  return (
    <>
      <RetailerDirectory
        data-screen-label="prospects"
        retailers={pipelineProspects}
        searchPlaceholder="Search BC prospects by name, city, address, or fit reason…"
        emptyMessage="No prospects match these filters. Converted accounts live under Active Accounts."
        highlightedId={highlightedProspectId}
        banner={
          successBanner ? (
            <p className="text-ink/80 m-0 text-sm" role="status">
              {successBanner}
            </p>
          ) : null
        }
        toolbarExtra={
          <Button
            variant="secondary"
            className="text-xs whitespace-nowrap"
            onClick={() => setAddOpen(true)}
          >
            + Add via AI
          </Button>
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
              onClick={() => {
                const chips = { prospectId: p.id, prospectName: p.name };
                openAssist({ chips, draft: buildSuggestDraft(chips) });
              }}
            >
              Suggest
            </Button>
            <Button
              variant="secondary"
              className="px-3 py-1 text-xs"
              onClick={() => {
                const chips = { prospectId: p.id, prospectName: p.name };
                openAssist({ chips, draft: buildApfDraft(chips) });
              }}
            >
              APF Brief
            </Button>
            <Button
              variant="secondary"
              className="px-3 py-1 text-xs"
              onClick={() => {
                const chips = { prospectId: p.id, prospectName: p.name };
                openAssist({ chips, draft: buildAssistDraft(chips) });
              }}
            >
              Ask AI
            </Button>
            <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => onLogCall(p)}>
              Log Call
            </Button>
          </>
        )}
      />

      <AddProspectAiModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={handleCreated}
      />

      <ProspectDetailDrawer
        prospect={detailProspect}
        onClose={() => setDetailProspect(null)}
        onLogCall={onLogCall}
        onConverted={onConverted}
        onNotesSaved={(notes) => {
          if (!detailProspect) return;
          setDetailProspect({ ...detailProspect, notes });
          onNotesSaved?.(detailProspect.id, notes);
        }}
      />
    </>
  );
}
