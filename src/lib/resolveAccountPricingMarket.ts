import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolvePricingMarketFromPublicPath,
  resolvePricingMarketFromRlaAssignment,
  resolvePricingMarketFromStaffSelector,
  type PricingMarket,
  type PublicMarket,
} from '@/lib/pricingMarket';
import { OGR_WHOLESALE_PATH } from '@/data/landing';
import type { Database } from '@/types/database';

type PricingMarketClient = SupabaseClient<Database>;

async function resolvePricingMarketForAssignmentId(
  client: PricingMarketClient,
  input: { salesLineId: string; salesLineTerritoryId: string | null },
): Promise<PricingMarket> {
  if (!input.salesLineTerritoryId) {
    return resolvePricingMarketFromRlaAssignment(null);
  }

  const { data: slt, error: sltError } = await client
    .from('sales_line_territories')
    .select('id, sales_line_id, territory_id, status')
    .eq('id', input.salesLineTerritoryId)
    .maybeSingle();
  if (sltError || !slt || slt.sales_line_id !== input.salesLineId) {
    return resolvePricingMarketFromRlaAssignment(null);
  }

  const { data: geo, error: geoError } = await client
    .from('territories')
    .select('id, code, country_code')
    .eq('id', slt.territory_id)
    .maybeSingle();
  if (geoError || !geo) {
    return resolvePricingMarketFromRlaAssignment(null);
  }

  return resolvePricingMarketFromRlaAssignment({
    status: slt.status,
    countryCode: geo.country_code,
    territoryId: geo.id,
    territoryCode: geo.code,
  });
}

/** Specific RLA: missing/inactive/mismatched assignment → unknown (hide CAD). */
export async function resolvePricingMarketForRetailerLineAccount(
  client: PricingMarketClient,
  retailerLineAccountId: string,
): Promise<PricingMarket> {
  const { data: rla, error } = await client
    .from('retailer_line_accounts')
    .select('id, sales_line_id, sales_line_territory_id, relationship_status')
    .eq('id', retailerLineAccountId)
    .neq('relationship_status', 'terminated')
    .maybeSingle();
  if (error || !rla) {
    return resolvePricingMarketFromRlaAssignment(null);
  }
  return resolvePricingMarketForAssignmentId(client, {
    salesLineId: rla.sales_line_id,
    salesLineTerritoryId: rla.sales_line_territory_id,
  });
}

/**
 * Prospect + line: no RLA row → Canadian default (standalone email paths).
 * RLA without a valid assignment → unknown.
 */
export async function resolvePricingMarketForProspectSalesLine(
  client: PricingMarketClient,
  input: { retailerId: number; salesLineId: string },
): Promise<PricingMarket> {
  const { data: rla, error } = await client
    .from('retailer_line_accounts')
    .select('id, sales_line_id, sales_line_territory_id, relationship_status')
    .eq('retailer_id', input.retailerId)
    .eq('sales_line_id', input.salesLineId)
    .neq('relationship_status', 'terminated')
    .maybeSingle();
  if (error || !rla) {
    return resolvePricingMarketFromPublicPath(OGR_WHOLESALE_PATH);
  }
  return resolvePricingMarketForAssignmentId(client, {
    salesLineId: rla.sales_line_id,
    salesLineTerritoryId: rla.sales_line_territory_id,
  });
}

/** Authenticated buyer: no RLA → null so the caller keeps path-authoritative presentation. */
export async function resolvePricingMarketForBuyerProspect(
  client: PricingMarketClient,
  prospectId: number,
): Promise<PricingMarket | null> {
  const { data: line, error: lineError } = await client
    .from('lines')
    .select('id')
    .eq('code', 'ogr')
    .maybeSingle();
  if (lineError || !line) return null;

  const { data: rla, error } = await client
    .from('retailer_line_accounts')
    .select('id, sales_line_id, sales_line_territory_id, relationship_status')
    .eq('retailer_id', prospectId)
    .eq('sales_line_id', line.id)
    .neq('relationship_status', 'terminated')
    .maybeSingle();
  if (error || !rla) return null;

  return resolvePricingMarketForAssignmentId(client, {
    salesLineId: rla.sales_line_id,
    salesLineTerritoryId: rla.sales_line_territory_id,
  });
}

/** Account-originated emails: OGR RLA if present, otherwise Canadian default paths. */
export async function resolveOgrPricingMarketForProspect(
  client: PricingMarketClient,
  prospectId: number,
): Promise<PricingMarket> {
  const { data: line, error } = await client
    .from('lines')
    .select('id')
    .eq('code', 'ogr')
    .maybeSingle();
  if (error || !line) {
    return resolvePricingMarketFromPublicPath(OGR_WHOLESALE_PATH);
  }
  return resolvePricingMarketForProspectSalesLine(client, {
    retailerId: prospectId,
    salesLineId: line.id,
  });
}

/**
 * Draft generate/send: current RLA assignment wins.
 * Missing/invalid assignment → unknown (not Canada).
 * No RLA row → stamped payload market, else Canadian default for existing drafts.
 */
export async function resolveOgrPricingMarketForProductEmailDraft(
  client: PricingMarketClient,
  input: { prospectId: number; payloadMarket?: PublicMarket | null },
): Promise<PricingMarket> {
  const { data: line, error: lineError } = await client
    .from('lines')
    .select('id')
    .eq('code', 'ogr')
    .maybeSingle();
  if (lineError || !line) {
    return input.payloadMarket
      ? resolvePricingMarketFromStaffSelector(input.payloadMarket)
      : resolvePricingMarketFromPublicPath(OGR_WHOLESALE_PATH);
  }

  const { data: rla, error } = await client
    .from('retailer_line_accounts')
    .select('id, sales_line_id, sales_line_territory_id, relationship_status')
    .eq('retailer_id', input.prospectId)
    .eq('sales_line_id', line.id)
    .neq('relationship_status', 'terminated')
    .maybeSingle();
  if (error || !rla) {
    return input.payloadMarket
      ? resolvePricingMarketFromStaffSelector(input.payloadMarket)
      : resolvePricingMarketFromPublicPath(OGR_WHOLESALE_PATH);
  }

  return resolvePricingMarketForAssignmentId(client, {
    salesLineId: rla.sales_line_id,
    salesLineTerritoryId: rla.sales_line_territory_id,
  });
}
