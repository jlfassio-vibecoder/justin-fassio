import { supabase } from '@/lib/supabase';
import type { AccountStatus, ProspectRow } from '@/types/database';
import {
  clampSecondaryChannels,
  coercePrimaryRetailChannel,
  normalizeLifestyleThemes,
  normalizePrimaryChannels,
  normalizeRetailCapabilities,
  normalizeSubchannels,
  normalizeVenueContexts,
  primaryRetailChannelLabel,
  subchannelOptionsFor,
  type LifestyleTheme,
  type PrimaryRetailChannel,
  type RetailCapability,
  type VenueContext,
} from '@/lib/crmRetailTaxonomy';

/** Primary retail channel code (formerly Golf|Marina|Hardware|Resort Gift). */
export type ProspectCategory = PrimaryRetailChannel;
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

export type ProspectTaxonomyFields = {
  secondaryChannels: PrimaryRetailChannel[];
  retailSubchannels: string[];
  venueContexts: VenueContext[];
  lifestyleThemes: LifestyleTheme[];
  retailCapabilities: RetailCapability[];
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

export const EMPTY_PROSPECT_TAXONOMY: ProspectTaxonomyFields = {
  secondaryChannels: [],
  retailSubchannels: [],
  venueContexts: [],
  lifestyleThemes: [],
  retailCapabilities: [],
};

/** Default BC territory fields for fixtures / tests. */
export const BC_PROSPECT_TERRITORY = {
  territoryId: '00000000-0000-4000-8000-0000000000bc',
  territoryCode: 'bc',
  territoryName: 'British Columbia',
};

export interface Prospect extends ProspectPlanningFields, ProspectTaxonomyFields {
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
  territoryId: string;
  territoryCode: string | null;
  territoryName: string | null;
}

export interface FetchProspectsOptions {
  /** When set, only rows with this account_status are returned. */
  accountStatus?: AccountStatus;
  /**
   * When set (flag-on line context), restrict to retailers with a non-terminated
   * retailer_line_account on this sales line. Omit for flag-off / legacy global reads.
   */
  salesLineId?: string;
}

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

export const PROSPECT_SELECT =
  'id, name, category, region, city, address, phone, fit, account_status, converted_at, initial_order_date, notes, territory_id, territories(code, name), external_id, subterritory, primary_district, retail_category, website, fit_score, ideal_opening_units, priority, provisional_grade, verification_status, buyer_verified, apparel_capability, existing_ogr, qualification_status, next_action, source_note, secondary_channels, retail_subchannels, venue_contexts, lifestyle_themes, retail_capabilities, created_at, updated_at' as const;

export type ProspectListRow = ProspectRow & {
  territories?: { code: string; name: string } | null;
};

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

export function mapProspectRow(row: ProspectListRow): Prospect {
  const category = coercePrimaryRetailChannel(row.category);
  const secondaryChannels = clampSecondaryChannels(category, asStringArray(row.secondary_channels));
  const subOpts = subchannelOptionsFor(category, secondaryChannels);
  return {
    id: row.id,
    name: row.name,
    category,
    region: row.region as ProspectRegion,
    city: row.city,
    address: row.address,
    phone: row.phone,
    fit: row.fit,
    accountStatus: row.account_status,
    convertedAt: row.converted_at,
    initialOrderDate: row.initial_order_date,
    notes: row.notes,
    territoryId: row.territory_id,
    territoryCode: row.territories?.code ?? null,
    territoryName: row.territories?.name ?? null,
    secondaryChannels,
    retailSubchannels: normalizeSubchannels(asStringArray(row.retail_subchannels), subOpts),
    venueContexts: normalizeVenueContexts(asStringArray(row.venue_contexts)),
    lifestyleThemes: normalizeLifestyleThemes(asStringArray(row.lifestyle_themes)),
    retailCapabilities: normalizeRetailCapabilities(asStringArray(row.retail_capabilities)),
    ...mapPlanningFields(row),
  };
}

export async function fetchProspects(options: FetchProspectsOptions = {}): Promise<{
  data: Prospect[];
  error: string | null;
}> {
  if (options.salesLineId) {
    const { data: rlaRows, error: rlaError } = await supabase
      .from('retailer_line_accounts')
      .select('retailer_id')
      .eq('sales_line_id', options.salesLineId)
      .neq('relationship_status', 'terminated');

    if (rlaError) {
      return { data: [], error: rlaError.message };
    }

    const retailerIds = [
      ...new Set((rlaRows ?? []).map((r) => r.retailer_id).filter((id) => Number.isFinite(id))),
    ];
    if (retailerIds.length === 0) {
      return { data: [], error: null };
    }

    let scoped = supabase
      .from('prospects')
      .select(PROSPECT_SELECT)
      .in('id', retailerIds)
      .order('id', { ascending: true });

    if (options.accountStatus) {
      scoped = scoped.eq('account_status', options.accountStatus);
    }

    const { data, error } = await scoped;
    if (error) {
      return { data: [], error: error.message };
    }
    return { data: (data ?? []).map(mapProspectRow), error: null };
  }

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
  options?: { writesEnabled?: boolean; salesLineId?: string | null },
): Promise<{ data: Prospect | null; error: string | null }> {
  const writesOn = Boolean(options?.writesEnabled && options.salesLineId);
  if (writesOn && options?.salesLineId) {
    const salesLineId = options.salesLineId;
    const { data: line, error: lineError } = await supabase
      .from('lines')
      .select('code')
      .eq('id', salesLineId)
      .maybeSingle();
    if (lineError) return { data: null, error: lineError.message };
    if (!line) return { data: null, error: 'Sales line not found' };

    const { data: rla, error: rlaError } = await supabase
      .from('retailer_line_accounts')
      .select('id')
      .eq('retailer_id', id)
      .eq('sales_line_id', salesLineId)
      .neq('relationship_status', 'terminated')
      .maybeSingle();
    if (rlaError) return { data: null, error: rlaError.message };
    if (!rla) return { data: null, error: 'Line account not found' };

    const { error: notesError } = await supabase
      .from('retailer_line_accounts')
      .update({ notes })
      .eq('id', rla.id);
    if (notesError) return { data: null, error: notesError.message };

    if (line.code !== 'ogr') {
      const { data: prospect, error: prospectError } = await supabase
        .from('prospects')
        .select(PROSPECT_SELECT)
        .eq('id', id)
        .maybeSingle();
      if (prospectError) return { data: null, error: prospectError.message };
      if (!prospect) return { data: null, error: 'Account not found' };
      return { data: { ...mapProspectRow(prospect as ProspectListRow), notes }, error: null };
    }
  }

  const { data, error } = await supabase
    .from('prospects')
    .update({ notes })
    .eq('id', id)
    .select(PROSPECT_SELECT)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: mapProspectRow(data as ProspectListRow), error: null };
}

export type ProspectTaxonomyPatch = {
  category: PrimaryRetailChannel;
  secondaryChannels: PrimaryRetailChannel[];
  retailSubchannels: string[];
  venueContexts: VenueContext[];
  lifestyleThemes: LifestyleTheme[];
  retailCapabilities: RetailCapability[];
};

export async function updateProspectTaxonomy(
  id: number,
  patch: ProspectTaxonomyPatch,
): Promise<{ data: Prospect | null; error: string | null }> {
  const secondary = clampSecondaryChannels(patch.category, patch.secondaryChannels);
  const subOpts = subchannelOptionsFor(patch.category, secondary);
  const { data, error } = await supabase
    .from('prospects')
    .update({
      category: patch.category,
      secondary_channels: secondary,
      retail_subchannels: normalizeSubchannels(patch.retailSubchannels, subOpts),
      venue_contexts: normalizeVenueContexts(patch.venueContexts),
      lifestyle_themes: normalizeLifestyleThemes(patch.lifestyleThemes),
      retail_capabilities: normalizeRetailCapabilities(patch.retailCapabilities),
    })
    .eq('id', id)
    .select(PROSPECT_SELECT)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: mapProspectRow(data as ProspectListRow), error: null };
}

export { primaryRetailChannelLabel, normalizePrimaryChannels };
