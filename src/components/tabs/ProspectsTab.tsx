import { useEffect, useMemo, useState } from 'react';
import { AddProspectAiModal } from '@/components/AddProspectAiModal';
import { AiUpdateResearchModal } from '@/components/AiUpdateResearchModal';
import { ProspectDetailDrawer } from '@/components/ProspectDetailDrawer';
import { RetailerDirectory } from '@/components/directory/RetailerDirectory';
import { Button } from '@/components/ui/Button';
import { useAiAssist } from '@/hooks/useAiAssist';
import { buildApfDraft, buildAssistDraft, buildSuggestDraft } from '@/lib/aiAssistPrefill';
import type { Prospect } from '@/lib/prospects';

const PLANNING_COLUMN_HEADERS = [
  'External ID',
  'Subterritory',
  'Primary district',
  'Retail category',
  'Website',
  'Fit score',
  'Ideal opening units',
  'Priority',
  'Grade',
  'Verification',
  'Buyer verified',
  'Apparel',
  'Existing OGR',
  'Qualification',
  'Next action',
  'Source note',
] as const;

function cellText(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  return String(value);
}

function TruncatedCell({ value, className = '' }: { value: string; className?: string }) {
  const display = value || '—';
  return (
    <td
      className={`border-ink/[0.08] max-w-[180px] truncate border-b p-2 opacity-75 ${className}`}
      title={display === '—' ? undefined : display}
    >
      {display}
    </td>
  );
}

interface ProspectsTabProps {
  prospects: Prospect[];
  onLogCall: (prospect: Prospect) => void;
  onConverted?: () => void;
  onProspectCreated?: (prospect: Prospect) => void;
  onProspectUpdated?: (prospect: Prospect) => void;
  onNotesSaved?: (id: number, notes: string | null) => void;
}

export function ProspectsTab({
  prospects,
  onLogCall,
  onConverted,
  onProspectCreated,
  onProspectUpdated,
  onNotesSaved,
}: ProspectsTabProps) {
  const { openAssist } = useAiAssist();
  const [addOpen, setAddOpen] = useState(false);
  const [highlightedProspectId, setHighlightedProspectId] = useState<number | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [detailProspect, setDetailProspect] = useState<Prospect | null>(null);
  const [aiUpdateProspect, setAiUpdateProspect] = useState<Prospect | null>(null);

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
        searchPlaceholder="Search BC prospects by name, city, address, fit, ID, website…"
        emptyMessage="No prospects match these filters. Converted accounts live under Active Accounts."
        highlightedId={highlightedProspectId}
        extraColumnHeaders={[...PLANNING_COLUMN_HEADERS]}
        renderExtraCells={(p) => (
          <>
            <td className="border-ink/[0.08] border-b p-2 whitespace-nowrap">
              {cellText(p.externalId)}
            </td>
            <td className="border-ink/[0.08] border-b p-2">{cellText(p.subterritory)}</td>
            <td className="border-ink/[0.08] border-b p-2">{cellText(p.primaryDistrict)}</td>
            <td className="border-ink/[0.08] border-b p-2">{cellText(p.retailCategory)}</td>
            <TruncatedCell value={cellText(p.website)} />
            <td className="border-ink/[0.08] border-b p-2 text-center">
              {p.fitScore != null ? p.fitScore : '—'}
            </td>
            <td className="border-ink/[0.08] border-b p-2 text-center">
              {cellText(p.idealOpeningUnits)}
            </td>
            <td className="border-ink/[0.08] border-b p-2 whitespace-nowrap">
              {cellText(p.priority)}
            </td>
            <td className="border-ink/[0.08] border-b p-2 whitespace-nowrap">
              {cellText(p.provisionalGrade)}
            </td>
            <TruncatedCell value={cellText(p.verificationStatus)} />
            <td className="border-ink/[0.08] border-b p-2">{p.buyerVerified ? 'Yes' : 'No'}</td>
            <td className="border-ink/[0.08] border-b p-2">{cellText(p.apparelCapability)}</td>
            <td className="border-ink/[0.08] border-b p-2">{cellText(p.existingOgr)}</td>
            <TruncatedCell value={cellText(p.qualificationStatus)} />
            <TruncatedCell value={cellText(p.nextAction)} />
            <TruncatedCell value={cellText(p.sourceNote)} />
          </>
        )}
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
              onClick={() => setAiUpdateProspect(p)}
            >
              AI Update
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

      <AiUpdateResearchModal
        open={aiUpdateProspect != null}
        prospect={aiUpdateProspect}
        onClose={() => setAiUpdateProspect(null)}
        onApplied={(prospect) => {
          onProspectUpdated?.(prospect);
          if (detailProspect?.id === prospect.id) {
            setDetailProspect(prospect);
          }
          setHighlightedProspectId(prospect.id);
          setSuccessBanner(`Updated ${prospect.name} (#${prospect.id})`);
        }}
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
