import { supabase } from '@/lib/supabase';

export type CatalogFieldChange = {
  id: string;
  fieldPath: string;
  oldValue: unknown;
  newValue: unknown;
  source: string;
  createdAt: string;
};

export async function fetchCatalogFieldChanges(
  catalogItemId: string,
  limit = 30,
): Promise<{ data: CatalogFieldChange[]; error: string | null }> {
  const { data, error } = await supabase
    .from('catalog_field_changes')
    .select('id, field_path, old_value, new_value, source, created_at')
    .eq('catalog_item_id', catalogItemId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { data: [], error: error.message };

  return {
    data: (data ?? []).map((row) => ({
      id: row.id as string,
      fieldPath: row.field_path as string,
      oldValue: row.old_value,
      newValue: row.new_value,
      source: (row.source as string) ?? 'user',
      createdAt: row.created_at as string,
    })),
    error: null,
  };
}
