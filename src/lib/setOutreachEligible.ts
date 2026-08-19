import type { AgentSupabase } from '@/lib/agentAuth';
import { hasMarker, markersAfterOutreachOptIn } from '@/lib/accountImport/classification';
import type { LineAccountMarker, RelationshipStatus } from '@/types/database';

export function assertOutreachOptInAllowed(row: {
  relationshipStatus: string;
  markers: readonly string[] | null | undefined;
  eligible: boolean;
}): { ok: true } | { ok: false; error: string } {
  if (row.relationshipStatus !== 'opened') {
    return { ok: false, error: 'Only opened reactivation candidates can be opted into outreach' };
  }
  if (!hasMarker(row.markers, 'reactivation_candidate')) {
    return { ok: false, error: 'Only reactivation candidates can be opted into outreach' };
  }
  if (row.eligible && hasMarker(row.markers, 'reactivation_unresponsive')) {
    return { ok: false, error: 'Unresponsive accounts cannot be included in outreach' };
  }
  return { ok: true };
}

export async function setOutreachEligible(
  supabase: AgentSupabase,
  input: { salesLineId: string; retailerId: number; eligible: boolean },
): Promise<
  { ok: true; markers: LineAccountMarker[] } | { ok: false; error: string; status: number }
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

  const allowed = assertOutreachOptInAllowed({
    relationshipStatus: rla.relationship_status as RelationshipStatus,
    markers: rla.line_account_markers,
    eligible: input.eligible,
  });
  if (!allowed.ok) return { ok: false, error: allowed.error, status: 400 };

  const markers = markersAfterOutreachOptIn(rla.line_account_markers, input.eligible);
  const { error: updateError } = await supabase
    .from('retailer_line_accounts')
    .update({ line_account_markers: markers })
    .eq('id', rla.id);
  if (updateError) return { ok: false, error: updateError.message, status: 500 };
  return { ok: true, markers };
}
