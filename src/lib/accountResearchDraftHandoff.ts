import type { OgrProductEmailComposerDraft } from '@/components/OgrProductEmailComposerModal';
import {
  composerDraftFromAgentDto,
  generateAgentProductOutreachDraft,
  getAgentProductOutreachDraftClient,
} from '@/lib/agentProductOutreachDraftClient';
import type { MatchItemResponse } from '@/lib/accountProductMatch';
import type { CatalogItem } from '@/lib/catalog';
import { fetchCatalogItems } from '@/lib/catalog';
import { formatOutreachPreparationDate } from '@/lib/outreachSelectTargets';
import type { Prospect } from '@/lib/prospects';
import type { ProductFitKind } from '@/lib/outreachProductSelection';

export type ResearchDraftContact = {
  accountContactId: string;
  toEmail: string;
  toName: string;
};

export function buildResearchMatchDraftTarget(input: {
  prospect: Prospect;
  matchItem: MatchItemResponse;
  contact: ResearchDraftContact;
  productSlug: string;
  productIsNew: boolean;
  productSalesRank: number | null;
  preparationDate?: string;
}) {
  const productFit = input.matchItem.product_fit as ProductFitKind;
  return {
    preparationDate: input.preparationDate ?? formatOutreachPreparationDate(new Date()),
    prospectId: input.prospect.id,
    prospectName: input.prospect.name,
    accountContactId: input.contact.accountContactId,
    toEmail: input.contact.toEmail,
    toName: input.contact.toName,
    primaryChannel: input.prospect.category,
    secondaryChannels: input.prospect.secondaryChannels,
    catalogItemId: input.matchItem.catalog_item_id,
    productSku: input.matchItem.sku,
    productName: input.matchItem.name,
    productSlug: input.productSlug,
    productIsNew: input.productIsNew,
    productSalesRank: input.productSalesRank,
    selectionReasons: {
      priority: null,
      fitScore: null,
      channelMatch: productFit === 'channel_intersect',
      productFit,
      exclusionsChecked: true as const,
    },
  };
}

export async function generateDraftFromResearchMatch(input: {
  prospect: Prospect;
  matchItem: MatchItemResponse;
  contact: ResearchDraftContact;
  salesLineId?: string;
  retailerLineAccountId?: string;
}): Promise<
  | {
      ok: true;
      draft: OgrProductEmailComposerDraft;
      systemMessageId: string;
      catalogItem: CatalogItem;
    }
  | { ok: false; error: string }
> {
  const catalogResult = await fetchCatalogItems({
    lineId: input.salesLineId ?? undefined,
  });
  if (catalogResult.error) {
    return { ok: false, error: catalogResult.error };
  }

  const catalogItem = catalogResult.data.find((row) => row.id === input.matchItem.catalog_item_id);
  if (!catalogItem?.publicSlug?.trim()) {
    return { ok: false, error: 'Matched product is not published for outreach email.' };
  }

  const target = buildResearchMatchDraftTarget({
    prospect: input.prospect,
    matchItem: input.matchItem,
    contact: input.contact,
    productSlug: catalogItem.publicSlug,
    productIsNew: catalogItem.isNew,
    productSalesRank: null,
  });

  const generated = await generateAgentProductOutreachDraft({
    target,
    salesLineId: input.salesLineId,
    retailerLineAccountId: input.retailerLineAccountId,
  });
  if (!generated.ok) {
    return { ok: false, error: generated.error };
  }

  const loaded = await getAgentProductOutreachDraftClient(generated.systemMessageId);
  if (!loaded.ok) {
    return { ok: false, error: loaded.error };
  }

  const d = loaded.draft;
  return {
    ok: true,
    systemMessageId: generated.systemMessageId,
    draft: composerDraftFromAgentDto(d, {
      prospectName: input.prospect.name,
      productIsNew: catalogItem.isNew,
    }),
    catalogItem,
  };
}

/** Staff-picked Active Account Email product target (not research match). */
export function buildAccountEmailPickDraftTarget(input: {
  prospect: Prospect;
  catalogItem: CatalogItem;
  contact: ResearchDraftContact;
  preparationDate?: string;
}) {
  const productSlug = (input.catalogItem.publicSlug ?? '').trim();
  return {
    preparationDate: input.preparationDate ?? formatOutreachPreparationDate(new Date()),
    prospectId: input.prospect.id,
    prospectName: input.prospect.name,
    accountContactId: input.contact.accountContactId,
    toEmail: input.contact.toEmail,
    toName: input.contact.toName,
    primaryChannel: input.prospect.category,
    secondaryChannels: input.prospect.secondaryChannels,
    catalogItemId: input.catalogItem.id,
    productSku: input.catalogItem.sku,
    productName: input.catalogItem.name,
    productSlug,
    productIsNew: input.catalogItem.isNew,
    productSalesRank: null as number | null,
    selectionReasons: {
      priority: null,
      fitScore: null,
      channelMatch: false,
      productFit: 'global_fallback' as const,
      exclusionsChecked: true as const,
    },
  };
}

/**
 * Staff-initiated Active Account or Prospect footer Email product → AI draft review.
 * Intentionally skips prep outreach cooldown.
 */
export async function generateDraftFromAccountEmailPick(input: {
  prospect: Prospect;
  catalogItem: CatalogItem;
  contact: ResearchDraftContact;
  salesLineId?: string;
  retailerLineAccountId?: string;
}): Promise<
  | {
      ok: true;
      draft: OgrProductEmailComposerDraft;
      systemMessageId: string;
      catalogItem: CatalogItem;
    }
  | { ok: false; error: string }
> {
  if (!input.contact.accountContactId.trim()) {
    return { ok: false, error: 'Select a saved contact with an email to send product email.' };
  }
  if (!input.contact.toEmail.trim()) {
    return { ok: false, error: 'Select a saved contact with an email to send product email.' };
  }
  if (!(input.catalogItem.publicSlug ?? '').trim()) {
    return { ok: false, error: 'Selected product is not published for outreach email.' };
  }

  const target = buildAccountEmailPickDraftTarget({
    prospect: input.prospect,
    catalogItem: input.catalogItem,
    contact: input.contact,
  });

  const generated = await generateAgentProductOutreachDraft({
    target,
    salesLineId: input.salesLineId,
    retailerLineAccountId: input.retailerLineAccountId,
  });
  if (!generated.ok) {
    return { ok: false, error: generated.error };
  }

  const loaded = await getAgentProductOutreachDraftClient(generated.systemMessageId);
  if (!loaded.ok) {
    return { ok: false, error: loaded.error };
  }

  return {
    ok: true,
    systemMessageId: generated.systemMessageId,
    draft: composerDraftFromAgentDto(loaded.draft, {
      prospectName: input.prospect.name,
      productIsNew: input.catalogItem.isNew,
    }),
    catalogItem: input.catalogItem,
  };
}
