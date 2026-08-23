import type { AgentSupabase } from '@/lib/agentAuth';
import { mapProspectRow, PROSPECT_SELECT } from '@/lib/prospects';
import type { ProspectRow } from '@/types/database';

export type ApplySuggestionErrorOutcome =
  | 'not_found'
  | 'forbidden_field'
  | 'invalid_citations'
  | 'canonical_value_changed'
  | 'protected_identity'
  | 'superseded_suggestion'
  | 'suggestion_not_pending';

export type ApplySuggestionResult =
  | { ok: true; outcome: 'applied' | 'already_applied'; retailerId: number }
  | {
      ok: false;
      error: string;
      status: number;
      outcome?: ApplySuggestionErrorOutcome;
    };

export type RejectSuggestionResult =
  | { ok: true; outcome: 'rejected' | 'already_rejected' }
  | {
      ok: false;
      error: string;
      status: number;
      outcome?: 'not_found' | 'suggestion_not_pending';
    };

function mapApplyRpcError(message: string): {
  status: number;
  outcome?: ApplySuggestionErrorOutcome;
} {
  if (/not found/i.test(message)) return { status: 404, outcome: 'not_found' };
  if (/PROTECTED_IDENTITY/i.test(message)) return { status: 403, outcome: 'protected_identity' };
  if (/CANONICAL_VALUE_CHANGED/i.test(message))
    return { status: 409, outcome: 'canonical_value_changed' };
  if (/SUPERSEDED_SUGGESTION/i.test(message))
    return { status: 409, outcome: 'superseded_suggestion' };
  if (/SUGGESTION_NOT_PENDING/i.test(message))
    return { status: 409, outcome: 'suggestion_not_pending' };
  if (/FORBIDDEN_FIELD/i.test(message)) return { status: 400, outcome: 'forbidden_field' };
  if (/INVALID_CITATIONS/i.test(message)) return { status: 400, outcome: 'invalid_citations' };
  return { status: 500, outcome: undefined };
}

export async function applyAccountResearchSuggestion(args: {
  supabase: AgentSupabase;
  suggestionId: string;
  confirmVerifiedOverwrite?: boolean;
}): Promise<ApplySuggestionResult> {
  const { data, error } = await args.supabase.rpc('apply_account_research_profile_suggestion', {
    p_suggestion_id: args.suggestionId,
    p_confirm_verified_overwrite: args.confirmVerifiedOverwrite === true,
  });

  if (error) {
    const mapped = mapApplyRpcError(error.message);
    return { ok: false, error: error.message, status: mapped.status, outcome: mapped.outcome };
  }

  const outcome =
    data && typeof data === 'object' && 'outcome' in data
      ? String((data as { outcome: string }).outcome)
      : 'applied';
  const retailerId =
    data && typeof data === 'object' && 'retailer_id' in data
      ? Number((data as { retailer_id: number }).retailer_id)
      : 0;

  if (outcome === 'already_applied') {
    return { ok: true, outcome: 'already_applied', retailerId };
  }
  return { ok: true, outcome: 'applied', retailerId };
}

export async function rejectAccountResearchSuggestion(args: {
  supabase: AgentSupabase;
  suggestionId: string;
}): Promise<RejectSuggestionResult> {
  const { data, error } = await args.supabase.rpc('reject_account_research_profile_suggestion', {
    p_suggestion_id: args.suggestionId,
  });

  if (error) {
    if (/not found/i.test(error.message)) {
      return { ok: false, error: error.message, status: 404, outcome: 'not_found' };
    }
    if (/SUGGESTION_NOT_PENDING/i.test(error.message)) {
      return { ok: false, error: error.message, status: 409, outcome: 'suggestion_not_pending' };
    }
    return { ok: false, error: error.message, status: 500 };
  }

  const outcome =
    data && typeof data === 'object' && 'outcome' in data
      ? String((data as { outcome: string }).outcome)
      : 'rejected';
  if (outcome === 'already_rejected') {
    return { ok: true, outcome: 'already_rejected' };
  }
  return { ok: true, outcome: 'rejected' };
}

export async function loadProspectAfterApply(supabase: AgentSupabase, retailerId: number) {
  const { data, error } = await supabase
    .from('prospects')
    .select(PROSPECT_SELECT)
    .eq('id', retailerId)
    .maybeSingle();
  if (error || !data) return null;
  return mapProspectRow(data as ProspectRow);
}
