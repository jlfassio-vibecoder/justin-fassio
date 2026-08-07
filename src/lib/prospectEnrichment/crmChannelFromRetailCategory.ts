import type { ProspectCategory } from '@/lib/prospects';
import {
  normalizeRetailCategory,
  type RetailCategory,
} from '@/lib/prospectEnrichment/retailCategoryConfig';
import { primaryFromRetailCategory } from '@/lib/crmRetailTaxonomy';

/** Map canonical retail category → CRM primary channel. */
export function crmChannelFromRetailCategory(
  retailCategory: string | RetailCategory | null | undefined,
): ProspectCategory | null {
  const cat =
    typeof retailCategory === 'string' ? normalizeRetailCategory(retailCategory) : retailCategory;
  if (!cat || cat === 'Other / needs review') return null;
  return primaryFromRetailCategory(cat, null);
}
