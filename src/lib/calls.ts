import { supabase } from '@/lib/supabase';

export const CALL_SELECT =
  'id, prospect_id, contact_name, outcome, pmf_score, order_value_cad, call_date, notes, objection_tags' as const;

export type CallRow = {
  id: string;
  prospect_id: number;
  contact_name: string | null;
  outcome: string;
  pmf_score: number | null;
  order_value_cad: number | null;
  call_date: string;
  notes: string | null;
  objection_tags: string[];
};

export async function fetchCalls(limit = 500): Promise<{
  data: CallRow[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('calls')
    .select(CALL_SELECT)
    .order('call_date', { ascending: false })
    .limit(limit);

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as CallRow[], error: null };
}
