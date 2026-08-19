import type { AgentSupabase } from '@/lib/agentAuth';
import {
  hasMarker,
  markersAfterMarkUnresponsive,
  markersAfterReopenCandidate,
} from '@/lib/accountImport/classification';
import { hasQualifyingOrderLast365Days } from '@/lib/accountImport/directoryPresentation';
import { formatLocalIsoDate } from '@/lib/reorderCadence';
import type { LineAccountMarker, RelationshipStatus } from '@/types/database';

export type ReactivationUnresponsiveAction = 'mark_unresponsive' | 'reopen_candidate';

export function assertMarkUnresponsiveAllowed(row: {
  relationshipStatus: string;
  markers: readonly string[] | null | undefined;
  hasQualifyingOrderLast365Days?: boolean;
}): { ok: true } | { ok: false; error: string } {
  if (row.hasQualifyingOrderLast365Days) {
    return {
      ok: false,
      error: 'Accounts with a qualifying order in the last 365 days cannot be marked unresponsive',
    };
  }
  if (row.relationshipStatus === 'terminated' || row.relationshipStatus === 'prospect') {
    return { ok: false, error: 'Only opened reactivation candidates can be marked unresponsive' };
  }
  if (!hasMarker(row.markers, 'historical_purchaser')) {
    return { ok: false, error: 'Only historical purchasers can be marked unresponsive' };
  }
  if (
    row.relationshipStatus === 'inactive' &&
    hasMarker(row.markers, 'reactivation_unresponsive')
  ) {
    return { ok: true };
  }
  if (row.relationshipStatus !== 'opened') {
    return { ok: false, error: 'Only opened reactivation candidates can be marked unresponsive' };
  }
  if (!hasMarker(row.markers, 'reactivation_candidate')) {
    return { ok: false, error: 'Only reactivation candidates can be marked unresponsive' };
  }
  return { ok: true };
}

export function assertReopenCandidateAllowed(row: {
  relationshipStatus: string;
  markers: readonly string[] | null | undefined;
}): { ok: true } | { ok: false; error: string } {
  if (row.relationshipStatus !== 'inactive') {
    return {
      ok: false,
      error: 'Only inactive unresponsive accounts can be reopened as candidates',
    };
  }
  if (!hasMarker(row.markers, 'historical_purchaser')) {
    return { ok: false, error: 'Only historical purchasers can be reopened as candidates' };
  }
  if (!hasMarker(row.markers, 'reactivation_unresponsive')) {
    return { ok: false, error: 'Only unresponsive accounts can be reopened as candidates' };
  }
  return { ok: true };
}

export async function setReactivationUnresponsive(
  supabase: AgentSupabase,
  input: {
    salesLineId: string;
    retailerId: number;
    action: ReactivationUnresponsiveAction;
  },
): Promise<
  | { ok: true; relationshipStatus: RelationshipStatus; markers: LineAccountMarker[] }
  | { ok: false; error: string; status: number }
> {
  const { data: rla, error: loadError } = await supabase
    .from('retailer_line_accounts')
    .select('id, relationship_status, line_account_markers')
    .eq('sales_line_id', input.salesLineId)
    .eq('retailer_id', input.retailerId)
    .neq('relationship_status', 'terminated')
    .maybeSingle();
  if (loadError) return { ok: false, error: loadError.message, status: 500 };
  if (!rla) return { ok: false, error: 'Line account not found', status: 404 };

  const relationshipStatus = rla.relationship_status as RelationshipStatus;
  const currentMarkers = rla.line_account_markers;

  if (input.action === 'mark_unresponsive') {
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('order_date, status')
      .eq('account_id', input.retailerId)
      .eq('line_id', input.salesLineId);
    if (ordersError) return { ok: false, error: ordersError.message, status: 500 };

    const allowed = assertMarkUnresponsiveAllowed({
      relationshipStatus,
      markers: currentMarkers,
      hasQualifyingOrderLast365Days: hasQualifyingOrderLast365Days(
        orders ?? [],
        formatLocalIsoDate(new Date()),
      ),
    });
    if (!allowed.ok) return { ok: false, error: allowed.error, status: 400 };

    const markers = markersAfterMarkUnresponsive(currentMarkers);
    const { error: updateError } = await supabase
      .from('retailer_line_accounts')
      .update({ relationship_status: 'inactive', line_account_markers: markers })
      .eq('id', rla.id);
    if (updateError) return { ok: false, error: updateError.message, status: 500 };
    return { ok: true, relationshipStatus: 'inactive', markers };
  }

  const allowed = assertReopenCandidateAllowed({
    relationshipStatus,
    markers: currentMarkers,
  });
  if (!allowed.ok) return { ok: false, error: allowed.error, status: 400 };

  const markers = markersAfterReopenCandidate(currentMarkers);
  const { error: updateError } = await supabase
    .from('retailer_line_accounts')
    .update({ relationship_status: 'opened', line_account_markers: markers })
    .eq('id', rla.id);
  if (updateError) return { ok: false, error: updateError.message, status: 500 };
  return { ok: true, relationshipStatus: 'opened', markers };
}
