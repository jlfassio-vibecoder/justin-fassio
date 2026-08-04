import type { ProspectCategory } from '@/lib/prospects';
import {
  normalizeRetailCategory,
  type RetailCategory,
} from '@/lib/prospectEnrichment/retailCategoryConfig';

/** Map canonical retail category → CRM channel filter enum. */
export function crmChannelFromRetailCategory(
  retailCategory: string | RetailCategory | null | undefined,
): ProspectCategory | null {
  const cat =
    typeof retailCategory === 'string' ? normalizeRetailCategory(retailCategory) : retailCategory;
  if (!cat || cat === 'Other / needs review') return null;
  if (cat === 'Golf pro shop') return 'Golf';
  if (cat === 'Marine dealer / supply' || cat === 'Marina / resort store') return 'Marina';
  if (cat === 'Hardware / farm store with apparel') return 'Hardware';
  return 'Resort Gift';
}
