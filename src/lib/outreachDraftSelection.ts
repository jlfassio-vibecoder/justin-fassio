import { isPrimaryRetailChannel, type PrimaryRetailChannel } from '@/lib/crmRetailTaxonomy';
import type { SelectedOutreachTarget } from '@/lib/outreachSelectTargets';
import type { ProductOutreachGenerationMeta } from '@/lib/systemMessages';

export function parsePrimaryRetailChannel(value: unknown): PrimaryRetailChannel | null {
  if (typeof value !== 'string' || !isPrimaryRetailChannel(value)) return null;
  return value;
}

export function parseSecondaryRetailChannels(value: unknown): PrimaryRetailChannel[] {
  if (!Array.isArray(value)) return [];
  const out: PrimaryRetailChannel[] = [];
  for (const item of value) {
    const channel = parsePrimaryRetailChannel(item);
    if (channel && !out.includes(channel)) out.push(channel);
  }
  return out;
}

/**
 * Prefer prep-frozen selection context from draft generation meta when present.
 * Live request keeps prospect/contact/product identity fields.
 */
export function applyFrozenOutreachSelection(
  target: SelectedOutreachTarget,
  generation: ProductOutreachGenerationMeta | undefined | null,
): SelectedOutreachTarget {
  if (!generation) return target;

  const frozenPrimary = parsePrimaryRetailChannel(generation.primaryChannel);
  const frozenSecondary =
    generation.secondaryChannels != null
      ? parseSecondaryRetailChannels(generation.secondaryChannels)
      : null;
  const hasFrozenRank = 'productSalesRank' in generation;
  const frozenReasons = generation.selectionReasons;

  return {
    ...target,
    preparationDate: generation.preparationDate.trim() || target.preparationDate,
    primaryChannel: frozenPrimary ?? target.primaryChannel,
    secondaryChannels: frozenSecondary ?? target.secondaryChannels,
    productSalesRank: hasFrozenRank
      ? (generation.productSalesRank ?? null)
      : target.productSalesRank,
    selectionReasons: {
      priority: frozenReasons.priority,
      fitScore: frozenReasons.fitScore,
      channelMatch: frozenReasons.channelMatch,
      productFit: frozenReasons.productFit,
      exclusionsChecked: true,
    },
  };
}

export type BuildSelectedTargetFromDraftInput = {
  draft: {
    id: string;
    prospectId: number;
    accountContactId: string;
    catalogItemId: string;
    prospectName?: string | null;
    productSku?: string | null;
    productSlug?: string | null;
    productIsNew?: boolean | null;
    payload?: {
      sku?: string;
      name?: string;
      slug?: string;
      generation?: ProductOutreachGenerationMeta | null;
    } | null;
  };
  preparationDate: string;
  prospectName: string;
  toEmail: string;
  toName: string;
  catalogItemId: string;
  productSku: string;
  productName: string;
  productSlug: string;
  productIsNew: boolean;
  /** Weak defaults when draft has no freeze (legacy / manual drafts). */
  fallbackTarget?: Partial<
    Pick<
      SelectedOutreachTarget,
      'primaryChannel' | 'secondaryChannels' | 'productSalesRank' | 'selectionReasons'
    >
  >;
};

/**
 * Build an Add-copy / regenerate target from a draft + live form fields,
 * applying frozen generation meta when present.
 */
export function buildSelectedTargetFromDraft(
  input: BuildSelectedTargetFromDraftInput,
): SelectedOutreachTarget {
  const fallbackReasons = input.fallbackTarget?.selectionReasons ?? {
    priority: null,
    fitScore: null,
    channelMatch: false,
    productFit: 'global_fallback' as const,
    exclusionsChecked: true as const,
  };

  const base: SelectedOutreachTarget = {
    preparationDate: input.preparationDate,
    prospectId: input.draft.prospectId,
    prospectName: input.prospectName,
    accountContactId: input.draft.accountContactId,
    toEmail: input.toEmail,
    toName: input.toName,
    primaryChannel: input.fallbackTarget?.primaryChannel ?? null,
    secondaryChannels: input.fallbackTarget?.secondaryChannels ?? [],
    catalogItemId: input.catalogItemId,
    productSku: input.productSku,
    productName: input.productName,
    productSlug: input.productSlug,
    productIsNew: input.productIsNew,
    productSalesRank: input.fallbackTarget?.productSalesRank ?? null,
    selectionReasons: {
      priority: fallbackReasons.priority,
      fitScore: fallbackReasons.fitScore,
      channelMatch: fallbackReasons.channelMatch,
      productFit: fallbackReasons.productFit,
      exclusionsChecked: true,
    },
  };

  return applyFrozenOutreachSelection(base, input.draft.payload?.generation ?? null);
}
