import { supabase } from '@/lib/supabase';
import type { AccountStatus, ProspectRow } from '@/types/database';

export type ProspectCategory = 'Golf' | 'Marina' | 'Hardware' | 'Resort Gift';
export type ProspectRegion =
  'Okanagan' | 'Shuswap' | 'Vancouver Island' | 'Sea-to-Sky' | 'Kootenays' | 'Fraser Valley';

/** Nullable planning fields from the BC named prospect list sheet. */
export type ProspectPlanningFields = {
  externalId: string | null;
  subterritory: string | null;
  primaryDistrict: string | null;
  retailCategory: string | null;
  website: string | null;
  fitScore: number | null;
  idealOpeningUnits: number | null;
  priority: string | null;
  provisionalGrade: string | null;
  verificationStatus: string | null;
  buyerVerified: boolean;
  apparelCapability: string | null;
  existingOgr: string | null;
  qualificationStatus: string | null;
  nextAction: string | null;
  sourceNote: string | null;
};

export const EMPTY_PROSPECT_PLANNING: ProspectPlanningFields = {
  externalId: null,
  subterritory: null,
  primaryDistrict: null,
  retailCategory: null,
  website: null,
  fitScore: null,
  idealOpeningUnits: null,
  priority: null,
  provisionalGrade: null,
  verificationStatus: null,
  buyerVerified: false,
  apparelCapability: null,
  existingOgr: null,
  qualificationStatus: null,
  nextAction: null,
  sourceNote: null,
};

export interface Prospect extends ProspectPlanningFields {
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
  notes: string | null;
}

export interface FetchProspectsOptions {
  /** When set, only rows with this account_status are returned. */
  accountStatus?: AccountStatus;
}

export const PROSPECT_SELECT =
  'id, name, category, region, city, address, phone, fit, account_status, converted_at, initial_order_date, notes, external_id, subterritory, primary_district, retail_category, website, fit_score, ideal_opening_units, priority, provisional_grade, verification_status, buyer_verified, apparel_capability, existing_ogr, qualification_status, next_action, source_note, created_at, updated_at' as const;

function mapPlanningFields(row: ProspectRow): ProspectPlanningFields {
  return {
    externalId: row.external_id,
    subterritory: row.subterritory,
    primaryDistrict: row.primary_district,
    retailCategory: row.retail_category,
    website: row.website,
    fitScore: row.fit_score,
    idealOpeningUnits: row.ideal_opening_units,
    priority: row.priority,
    provisionalGrade: row.provisional_grade,
    verificationStatus: row.verification_status,
    buyerVerified: row.buyer_verified,
    apparelCapability: row.apparel_capability,
    existingOgr: row.existing_ogr,
    qualificationStatus: row.qualification_status,
    nextAction: row.next_action,
    sourceNote: row.source_note,
  };
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
    accountStatus: row.account_status,
    convertedAt: row.converted_at,
    initialOrderDate: row.initial_order_date,
    notes: row.notes,
    ...mapPlanningFields(row),
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

export async function updateProspectNotes(
  id: number,
  notes: string | null,
): Promise<{ data: Prospect | null; error: string | null }> {
  const { data, error } = await supabase
    .from('prospects')
    .update({ notes })
    .eq('id', id)
    .select(PROSPECT_SELECT)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: mapProspectRow(data as ProspectRow), error: null };
}
