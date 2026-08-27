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
