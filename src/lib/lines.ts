import { supabase } from '@/lib/supabase';

/** Resolve the Old Guys Rule line UUID, or null if missing / errored. */
export async function resolveOgrLineId(): Promise<string | null> {
  const { data, error } = await supabase.from('lines').select('id').eq('code', 'ogr').maybeSingle();
  if (error || !data) return null;
  return data.id;
}
