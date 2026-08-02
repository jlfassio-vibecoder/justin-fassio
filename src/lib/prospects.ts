import { supabase } from '@/lib/supabase';
import type { ProspectRow } from '@/types/database';

export type ProspectCategory = 'Golf' | 'Marina' | 'Hardware' | 'Resort Gift';
export type ProspectRegion =
  | 'Okanagan'
  | 'Shuswap'
  | 'Vancouver Island'
  | 'Sea-to-Sky'
  | 'Kootenays'
  | 'Fraser Valley';

export interface Prospect {
  id: number;
  name: string;
  category: ProspectCategory;
  region: ProspectRegion;
  city: string;
  address: string;
  phone: string;
  fit: string;
}

export function mapProspectRow(row: ProspectRow): Prospect {
  return {
    id: row.id,
    name: row.name,
    category: row.category as ProspectCategory,
    region: row.region as ProspectRegion,
    city: row.city,
    address: row.address,
    phone: row.phone,
    fit: row.fit,
  };
}

export async function fetchProspects(): Promise<{
  data: Prospect[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('prospects')
    .select('id, name, category, region, city, address, phone, fit, created_at, updated_at')
    .order('id', { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []).map(mapProspectRow), error: null };
}
