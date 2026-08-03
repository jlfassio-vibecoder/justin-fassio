import { supabase } from '@/lib/supabase';
import type { AccountStatus, ProspectRow } from '@/types/database';

export type ProspectCategory = 'Golf' | 'Marina' | 'Hardware' | 'Resort Gift';
export type ProspectRegion =
  'Okanagan' | 'Shuswap' | 'Vancouver Island' | 'Sea-to-Sky' | 'Kootenays' | 'Fraser Valley';

export interface Prospect {
  id: number;
  name: string;
  category: ProspectCategory;
  region: ProspectRegion;
  city: string;
  address: string;
  phone: string;
  fit: string;
  accountStatus: AccountStatus;
  convertedAt: string | null;
  initialOrderDate: string | null;
}

export interface FetchProspectsOptions {
  /** When set, only rows with this account_status are returned. */
  accountStatus?: AccountStatus;
}

const PROSPECT_SELECT =
  'id, name, category, region, city, address, phone, fit, account_status, converted_at, initial_order_date, created_at, updated_at' as const;

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
    accountStatus: row.account_status,
    convertedAt: row.converted_at,
    initialOrderDate: row.initial_order_date,
  };
}

export async function fetchProspects(options: FetchProspectsOptions = {}): Promise<{
  data: Prospect[];
  error: string | null;
}> {
  let query = supabase.from('prospects').select(PROSPECT_SELECT).order('id', { ascending: true });

  if (options.accountStatus) {
    query = query.eq('account_status', options.accountStatus);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []).map(mapProspectRow), error: null };
}
