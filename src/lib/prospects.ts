import { supabase } from '@/lib/supabase';
import { resolveOgrLineId, resolveWriteSalesLineId } from '@/lib/lines';
import { isLineAccountMarker } from '@/lib/accountImport/classification';
import { accountStatusFromRelationship } from '@/lib/ogrCommercial';
import type {
  AccountStatus,
  LineAccountMarker,
  ProspectRow,
  RelationshipStatus,
} from '@/types/database';
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
export type BcProspectRegion =
  'Okanagan' | 'Shuswap' | 'Vancouver Island' | 'Sea-to-Sky' | 'Kootenays' | 'Fraser Valley';
/** Known region labels; prospects.region is free text and may include other values. */
export type ProspectRegion =
  BcProspectRegion | 'Oregon' | 'Washington' | 'Alberta' | 'California' | 'British Columbia';

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
  importProtected: boolean;
  apparelCapability: string | null;
  existingOgr: string | null;
  qualificationStatus: string | null;
  nextAction: string | null;
  sourceNote: string | null;
  postalCode: string | null;
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
  importProtected: false,
  apparelCapability: null,
  existingOgr: null,
  qualificationStatus: null,
  nextAction: null,
  sourceNote: null,
  postalCode: null,
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
  /** Free-text CRM region (known labels + custom values from AI/editor). */
  region: string;
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
  /** Present when fetchProspects is scoped to a sales line (Phase 6 EP directory). */
  lineRelationshipStatus?: RelationshipStatus | null;
  lineAccountMarkers?: LineAccountMarker[];
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
  'id, name, category, region, city, address, phone, fit, account_status, converted_at, initial_order_date, notes, territory_id, territories(code, name), external_id, subterritory, primary_district, retail_category, website, fit_score, ideal_opening_units, priority, provisional_grade, verification_status, buyer_verified, import_protected, apparel_capability, existing_ogr, qualification_status, next_action, source_note, postal_code, secondary_channels, retail_subchannels, venue_contexts, lifestyle_themes, retail_capabilities, created_at, updated_at' as const;

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
    importProtected: row.import_protected,
    apparelCapability: row.apparel_capability,
    existingOgr: row.existing_ogr,
    qualificationStatus: row.qualification_status,
    nextAction: row.next_action,
    sourceNote: row.source_note,
    postalCode: row.postal_code,
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
    region: row.region,
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

/**
 * After a prospects row update, keep line-scoped commercial fields from the
 * in-memory directory prospect (RLA overlay). Never replace those from legacy
 * account_status on the raw row alone.
 */
export function mergeProspectIdentity(existing: Prospect, saved: Prospect): Prospect {
  return {
    ...saved,
    accountStatus: existing.accountStatus,
    convertedAt: existing.convertedAt,
    initialOrderDate: existing.initialOrderDate,
    lineRelationshipStatus: existing.lineRelationshipStatus,
    lineAccountMarkers: existing.lineAccountMarkers,
  };
}

type RlaCommercial = {
  relationshipStatus: RelationshipStatus;
  convertedAt: string | null;
  initialOrderDate: string | null;
  lineAccountMarkers: LineAccountMarker[];
};

function overlayProspectCommercial(prospect: Prospect, rla: RlaCommercial | undefined): Prospect {
  if (!rla) return prospect;
  return {
    ...prospect,
    accountStatus: accountStatusFromRelationship(rla.relationshipStatus),
    convertedAt: rla.convertedAt,
    initialOrderDate: rla.initialOrderDate,
    lineRelationshipStatus: rla.relationshipStatus,
    lineAccountMarkers: rla.lineAccountMarkers,
  };
}

async function fetchRlaCommercialByRetailer(
  salesLineId: string,
): Promise<{ data: Map<number, RlaCommercial>; error: string | null }> {
  const { data, error } = await supabase
    .from('retailer_line_accounts')
    .select(
      'retailer_id, relationship_status, converted_at, initial_order_date, line_account_markers',
    )
    .eq('sales_line_id', salesLineId)
    .neq('relationship_status', 'terminated');

  if (error) {
    return { data: new Map(), error: error.message };
  }

  const map = new Map<number, RlaCommercial>();
  for (const row of data ?? []) {
    if (!Number.isFinite(row.retailer_id)) continue;
    map.set(row.retailer_id, {
      relationshipStatus: row.relationship_status as RelationshipStatus,
      convertedAt: row.converted_at,
      initialOrderDate: row.initial_order_date,
      lineAccountMarkers: (row.line_account_markers ?? []).filter(isLineAccountMarker),
    });
  }
  return { data: map, error: null };
}

export async function fetchProspects(options: FetchProspectsOptions = {}): Promise<{
  data: Prospect[];
  error: string | null;
}> {
  const requestedLineId = options.salesLineId?.trim() || null;
  const overlayLineId = requestedLineId ?? (await resolveOgrLineId());
  if (requestedLineId) {
    const commercial = await fetchRlaCommercialByRetailer(requestedLineId);
    if (commercial.error) {
      return { data: [], error: commercial.error };
    }
    const retailerIds = [...commercial.data.keys()];
    if (retailerIds.length === 0) {
      return { data: [], error: null };
    }

    const { data, error } = await supabase
      .from('prospects')
      .select(PROSPECT_SELECT)
      .in('id', retailerIds)
      .order('id', { ascending: true });

    if (error) {
      return { data: [], error: error.message };
    }
    let rows = (data ?? []).map((row) =>
      overlayProspectCommercial(mapProspectRow(row), commercial.data.get(row.id)),
    );
    if (options.accountStatus) {
      rows = rows.filter((row) => row.accountStatus === options.accountStatus);
    }
    return { data: rows, error: null };
  }

  const { data, error } = await supabase
    .from('prospects')
    .select(PROSPECT_SELECT)
    .order('id', { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  let commercial = new Map<number, RlaCommercial>();
  if (overlayLineId) {
    const overlay = await fetchRlaCommercialByRetailer(overlayLineId);
    if (overlay.error) {
      return { data: [], error: overlay.error };
    }
    commercial = overlay.data;
  }

  let rows = (data ?? []).map((row) =>
    overlayProspectCommercial(mapProspectRow(row), commercial.get(row.id)),
  );
  if (options.accountStatus) {
    rows = rows.filter((row) => row.accountStatus === options.accountStatus);
  }
  return { data: rows, error: null };
}

export async function updateProspectNotes(
  id: number,
  notes: string | null,
  options?: { writesEnabled?: boolean; salesLineId?: string | null },
): Promise<{ data: Prospect | null; error: string | null }> {
  const salesLineId = await resolveWriteSalesLineId(options?.salesLineId);
  if (salesLineId) {
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
  existing?: Prospect,
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

  const mapped = mapProspectRow(data as ProspectListRow);
  return {
    data: existing ? mergeProspectIdentity(existing, mapped) : mapped,
    error: null,
  };
}

export { primaryRetailChannelLabel, normalizePrimaryChannels };
