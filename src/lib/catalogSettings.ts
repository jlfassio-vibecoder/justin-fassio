import { supabase } from '@/lib/supabase';
import type { LandedCostFactors } from '@/lib/landedCost';
import type { CatalogSettingsRow } from '@/types/database';

/** SupplierTerms + landed-cost line settings (description.md). */
export type CatalogSupplierTerms = {
  id: string;
  lineId: string;
  catalogYear: number;
  minOrderPieces: number;
  minPiecesPerDesign: number;
  shippingOrigin: string;
  defaultShippingMethod: string;
  pricesSubjectToChange: boolean;
  backorderPolicy: string;
  orderProcessingPolicy: string;
  claimsPolicy: string;
  returnsPolicy: string;
  dutyRate: number;
  surtaxRate: number;
  brokerageAllocationCad: number;
  freightAllocationCad: number;
  importGstRecoverable: boolean;
  termsVerified: boolean;
  termsNote: string;
};

export function mapCatalogSettingsRow(row: CatalogSettingsRow): CatalogSupplierTerms {
  return {
    id: row.id,
    lineId: row.line_id,
    catalogYear: row.catalog_year,
    minOrderPieces: row.min_order_pieces,
    minPiecesPerDesign: row.min_pieces_per_design,
    shippingOrigin: row.shipping_origin ?? '',
    defaultShippingMethod: row.default_shipping_method ?? '',
    pricesSubjectToChange: row.prices_subject_to_change,
    backorderPolicy: row.backorder_policy ?? '',
    orderProcessingPolicy: row.order_processing_policy ?? '',
    claimsPolicy: row.claims_policy ?? '',
    returnsPolicy: row.returns_policy ?? '',
    dutyRate: Number(row.duty_rate),
    surtaxRate: Number(row.surtax_rate),
    brokerageAllocationCad: Number(row.brokerage_allocation_cad),
    freightAllocationCad: Number(row.freight_allocation_cad),
    importGstRecoverable: row.import_gst_recoverable,
    termsVerified: row.terms_verified,
    termsNote: row.terms_note ?? '',
  };
}

/**
 * Merge settings duty/surtax into calculator factors.
 * Freight rate stays UI-driven; duty/surtax fold into otherTaxRate when present.
 */
export function factorsWithSettings(
  base: LandedCostFactors,
  settings: CatalogSupplierTerms | null | undefined,
): LandedCostFactors {
  if (!settings) return base;
  const dutyAndSurtax = settings.dutyRate + settings.surtaxRate;
  return {
    ...base,
    // Stack UI "other" with settings duty/surtax (do not collapse via max).
    otherTaxRate: base.otherTaxRate + dutyAndSurtax,
    dutyRate: settings.dutyRate,
    surtaxRate: settings.surtaxRate,
    brokerageAllocationCad: settings.brokerageAllocationCad,
    importGstRecoverable: settings.importGstRecoverable,
  };
}

export async function fetchOgrCatalogSettings(): Promise<{
  data: CatalogSupplierTerms | null;
  error: string | null;
}> {
  const { data: line, error: lineError } = await supabase
    .from('lines')
    .select('id')
    .eq('code', 'ogr')
    .maybeSingle();

  if (lineError) return { data: null, error: lineError.message };
  if (!line) return { data: null, error: 'Old Guys Rule line not found' };

  const { data, error } = await supabase
    .from('catalog_settings')
    .select('*')
    .eq('line_id', line.id)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };
  return { data: mapCatalogSettingsRow(data as CatalogSettingsRow), error: null };
}
