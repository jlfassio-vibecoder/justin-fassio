/**
 * Phase 3 lead-state chip for Prospect / Account drawers.
 * Visual split from Line Sheet Opened/Clicked: Warm=outline, Hot=accent, Call today=accent-2.
 * Does not call markProductEngagementSeen or clear engagement counters.
 */

import { useEffect, useState } from 'react';
import { Tag } from '@/components/ui/Tag';
import { supabase } from '@/lib/supabase';
import { getOutreachLeadForProspect, type OutreachLeadRow } from '@/lib/outreachLeadLists';

type Props = {
  prospectId: number;
};

type LoadState =
  | { status: 'loading'; prospectId: number }
  | { status: 'ready'; prospectId: number; lead: OutreachLeadRow | null }
  | { status: 'error'; prospectId: number };

function summaryLine(lead: OutreachLeadRow): string {
  const parts: string[] = [];
  if (lead.engagement.clickCount > 0) {
    parts.push(
      `${lead.engagement.distinctProductsClicked} product${lead.engagement.distinctProductsClicked === 1 ? '' : 's'} clicked`,
    );
  } else if (lead.engagement.openCount > 0) {
    parts.push(
      `${lead.engagement.distinctProductsOpened} product${lead.engagement.distinctProductsOpened === 1 ? '' : 's'} opened`,
    );
  } else if (lead.engagement.emailsSent > 0) {
    parts.push(`${lead.engagement.emailsSent} sent, no engagement yet`);
  } else {
    parts.push('No product outreach yet');
  }
  if (lead.engagement.reply.attributed) parts.push('reply attributed');
  if (lead.engagement.suppressed) parts.push('suppressed');
  return parts.join(' · ');
}

export function OutreachLeadStateChip({ prospectId }: Props) {
  const [state, setState] = useState<LoadState>({ status: 'loading', prospectId });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const row = await getOutreachLeadForProspect({
          client: supabase,
          prospectId,
        });
        if (!cancelled) {
          setState({ status: 'ready', prospectId, lead: row });
        }
      } catch {
        if (!cancelled) {
          setState({ status: 'error', prospectId });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prospectId]);

  const active =
    state.prospectId === prospectId
      ? state
      : ({ status: 'loading', prospectId } satisfies LoadState);

  if (active.status === 'error') {
    return <span className="text-ink/50 text-xs">Lead state unavailable</span>;
  }
  if (active.status === 'loading' || active.status !== 'ready') {
    return <span className="text-ink/40 text-xs">Loading lead…</span>;
  }

  const lead = active.lead;
  if (!lead) {
    return <span className="text-ink/50 text-xs">No lead data</span>;
  }

  const stateVariant =
    lead.leadState === 'hot' ? 'accent' : lead.leadState === 'warm' ? 'outline' : 'neutral';
  const stateLabel = lead.leadState === 'hot' ? 'Hot' : lead.leadState === 'warm' ? 'Warm' : 'Cold';

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Tag variant={stateVariant} data-testid="outreach-lead-state">
          {stateLabel}
        </Tag>
        {lead.callToday ? (
          <Tag variant="accent-2" data-testid="outreach-call-today">
            Call today
          </Tag>
        ) : null}
      </div>
      <p className="text-ink/60 m-0 text-xs">{summaryLine(lead)}</p>
    </div>
  );
}
