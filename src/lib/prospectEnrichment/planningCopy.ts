import type { RetailCategory } from '@/lib/prospectEnrichment/retailCategoryConfig';
import type { ProspectPriority } from '@/lib/prospectEnrichment/priorityGrade';

/** Reason-for-inclusion style text when fit is blank (template, not free invention). */
export function buildReasonForInclusion(input: {
  retailCategory: RetailCategory | string;
  customerAlignmentNotes?: string | null;
}): string {
  const notes = input.customerAlignmentNotes?.trim();
  if (notes) {
    return `${notes} Validate apparel authority, open-to-buy and replenishment before travel.`;
  }
  return `Planning lead in ${input.retailCategory}; confirm apparel merchandising, buyer authority and open-to-buy before route.`;
}

/** Next-action templates when blank (doc § next-action patterns). */
export function recommendNextAction(input: {
  priority: ProspectPriority | string | null | undefined;
  hasWebsite: boolean;
  apparelCapability: string | null | undefined;
}): string {
  const apparel = (input.apparelCapability ?? '').toLowerCase();
  if (!input.hasWebsite) {
    return 'Verify the business is currently operating and locate an official website or current directory record.';
  }
  if (apparel === 'unknown' || apparel === '' || apparel === 'none' || apparel === 'no') {
    return 'Confirm whether the location sells third-party apparel and has space for a 24–60-piece opening assortment.';
  }
  if (input.priority === 'Tier 3') {
    return 'Continue remote research and nurture; do not schedule field travel until buyer interest or route density improves.';
  }
  if (input.priority === 'Tier 1') {
    return 'Identify the current apparel buyer and complete a phone qualification before adding the account to the next route.';
  }
  return 'Send a category-specific introduction, then call to confirm apparel capability, retail pricing and seasonal buying timing.';
}

export function verificationStatusFromEvidence(input: {
  hasOfficialWebsite: boolean;
  directoryOnly?: boolean;
}): string {
  if (input.hasOfficialWebsite) return 'Website confirmed';
  if (input.directoryOnly) return 'Directory lead';
  return 'Unverified';
}
