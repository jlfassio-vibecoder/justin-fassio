/**
 * On-demand Product Outreach follow-up draft (Briefing Email action).
 * Reuses a pending agent draft when present. Otherwise generates one, allowing
 * a single extra send during cooldown when the prospect clicked or replied.
 * Never calls Resend.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACCOUNT_CONTACT_SELECT,
  mapAccountContactRow,
  type AccountContact,
} from '@/lib/accountContacts';
import { generateOgrProductOutreachDraft } from '@/lib/generateOgrProductOutreachDraft';
import {
  isWithinOutreachCooldown,
  pickOutreachContact,
  resolveProspectOutreachChannels,
} from '@/lib/outreachEligibility';
import { loadOutreachMessagesForProspect } from '@/lib/outreachEngagementAggregate';
import {
  canGenerateFollowUpEmail,
  clickOrReplyInLeadWindow,
  lastClickedCatalogItemIdFromMessages,
  lastEngagedCatalogItemIdFromMessages,
  resolveFollowUpProductId,
} from '@/lib/outreachFollowUpQueue';
import {
  getOutreachLeadForProspect,
  loadUniqueContactEmailsForProspect,
} from '@/lib/outreachLeadLists';
import { loadOutreachProductPool, selectProductForProspect } from '@/lib/outreachProductSelection';
import { formatOutreachPreparationDate } from '@/lib/outreachSelectTargets';
import {
  AGENT_OUTREACH_PENDING_DRAFT_STATUSES,
  AGENT_OUTREACH_PRODUCT_DEDUP_DAYS,
} from '@/lib/outreachSelectionConstants';
import { resolveOutreachLeadRules } from '@/lib/resolveOutreachLeadRules';
import { mapProspectRow, PROSPECT_SELECT, type ProspectListRow } from '@/lib/prospects';
import {
  fetchRecentProductOutreachCatalogIdsByProspect,
  listAgentProductOutreachDrafts,
} from '@/lib/systemMessages';
import type { AccountContact as AccountContactRow, Database } from '@/types/database';

type Client = SupabaseClient<Database>;

export type CreateOutreachFollowUpDraftResult =
  | {
      ok: true;
      draftId: string;
      catalogItemId: string;
      productName: string;
      reusedPending: boolean;
    }
  | { ok: false; error: string; status: 400 | 404 | 409 | 502 };

export async function createOutreachFollowUpDraft(params: {
  client: Client;
  prospectId: number;
  userId: string | null;
  salesLineId?: string | null;
  retailerLineAccountId?: string | null;
  asOf?: Date;
}): Promise<CreateOutreachFollowUpDraftResult> {
  const asOf = params.asOf ?? new Date();
  const prospectId = params.prospectId;

  const pending = await listAgentProductOutreachDrafts(params.client, {
    prospectId,
    statuses: [...AGENT_OUTREACH_PENDING_DRAFT_STATUSES],
    limit: 1,
  });
  if (!pending.ok) return { ok: false, error: pending.error, status: 502 };
  const existing = pending.drafts[0];
  if (existing) {
    return {
      ok: true,
      draftId: existing.id,
      catalogItemId: existing.catalogItemId,
      productName: existing.payload.name?.trim() || existing.payload.sku || 'Product',
      reusedPending: true,
    };
  }

  const rules = (await resolveOutreachLeadRules({ client: params.client, asOf })).rules;
  const lead = await getOutreachLeadForProspect({
    client: params.client,
    prospectId,
    asOf,
    rules,
  });
  if (!lead) return { ok: false, error: 'Prospect not found', status: 404 };

  const inCooldown = isWithinOutreachCooldown(lead.engagement.lastSentAt, { asOf });
  const clickOrReply = clickOrReplyInLeadWindow({
    lastClickedAt: lead.engagement.lastClickedAt,
    replyAttributed: lead.engagement.reply.attributed,
    replyLastMessageAt: lead.engagement.reply.lastMessageAt,
    asOf,
    rules,
  });
  const allowed = canGenerateFollowUpEmail({
    inCooldown,
    clickOrReplyInWindow: clickOrReply,
    emailsSentInWindow: lead.emailsSentInWindow,
    hasPendingDraft: false,
  });
  if (!allowed.ok) return { ok: false, error: allowed.error, status: 409 };

  const { data: prospectRow, error: prospectError } = await params.client
    .from('prospects')
    .select(PROSPECT_SELECT)
    .eq('id', prospectId)
    .maybeSingle();
  if (prospectError) return { ok: false, error: prospectError.message, status: 502 };
  if (!prospectRow) return { ok: false, error: 'Prospect not found', status: 404 };
  const prospect = mapProspectRow(prospectRow as ProspectListRow);

  const { data: contactRows, error: contactError } = await params.client
    .from('account_contacts')
    .select(ACCOUNT_CONTACT_SELECT)
    .eq('account_id', prospectId)
    .order('is_primary', { ascending: false })
    .order('full_name', { ascending: true });
  if (contactError) return { ok: false, error: contactError.message, status: 502 };
  const contacts: AccountContact[] = ((contactRows ?? []) as AccountContactRow[]).map(
    mapAccountContactRow,
  );
  const picked = pickOutreachContact(contacts);
  if (!picked) {
    return { ok: false, error: 'No usable outreach email on file', status: 409 };
  }

  const uniqueEmails = await loadUniqueContactEmailsForProspect({
    client: params.client,
    prospectId,
  });
  const loadedMessages = await loadOutreachMessagesForProspect({
    client: params.client,
    prospectId,
    contactEmails: uniqueEmails,
  });
  const lastClickedId = lastClickedCatalogItemIdFromMessages(loadedMessages.messages);
  const lastSentId = lastEngagedCatalogItemIdFromMessages(loadedMessages.messages);

  const poolResult = await loadOutreachProductPool(params.client, {
    lineId: params.salesLineId ?? undefined,
  });
  if (!poolResult.ok) return { ok: false, error: poolResult.error, status: 502 };

  const dedup = await fetchRecentProductOutreachCatalogIdsByProspect(
    params.client,
    [prospectId],
    AGENT_OUTREACH_PRODUCT_DEDUP_DAYS,
    asOf,
  );
  if (!dedup.ok) return { ok: false, error: dedup.error, status: 502 };
  const excludeCatalogItemIds = dedup.byProspectId.get(prospectId) ?? new Set<string>();

  const channels = resolveProspectOutreachChannels(prospect);
  const productPick = selectProductForProspect(poolResult.pool, {
    prospectChannels: channels.allChannels,
    prospectLifestyleThemes: prospect.lifestyleThemes,
    excludeCatalogItemIds,
  });
  const resolved = resolveFollowUpProductId({
    selectedCatalogItemId: productPick?.product.id ?? null,
    lastClickedCatalogItemId: lastClickedId,
    lastSentCatalogItemId: lastSentId,
  });
  if (!resolved) {
    return { ok: false, error: 'No follow-up product available', status: 409 };
  }

  const product =
    productPick && !resolved.bumped
      ? productPick.product
      : (poolResult.pool.find((p) => p.id === resolved.catalogItemId) ?? productPick?.product);
  if (!product) {
    return { ok: false, error: 'No follow-up product available', status: 409 };
  }

  const generated = await generateOgrProductOutreachDraft(params.client, {
    target: {
      preparationDate: formatOutreachPreparationDate(asOf),
      prospectId,
      prospectName: prospect.name,
      accountContactId: picked.contact.id,
      toEmail: picked.toEmail,
      toName: picked.contact.fullName?.trim() || prospect.name,
      primaryChannel: channels.primaryChannel,
      secondaryChannels: channels.secondaryChannels,
      catalogItemId: product.id,
      productSku: product.sku,
      productName: product.name,
      productSlug: product.publicSlug,
      productIsNew: product.isNew,
      productSalesRank: product.salesRank,
      selectionReasons: {
        priority: prospect.priority,
        fitScore: prospect.fitScore,
        channelMatch: Boolean(channels.primaryChannel),
        productFit: resolved.bumped
          ? 'global_fallback'
          : (productPick?.productFit ?? 'global_fallback'),
        exclusionsChecked: true,
      },
    },
    userId: params.userId,
    salesLineId: params.salesLineId ?? undefined,
    retailerLineAccountId: params.retailerLineAccountId,
    copyMode: 'ai',
  });
  if (!generated.ok) return { ok: false, error: generated.error, status: 502 };

  return {
    ok: true,
    draftId: generated.draftId,
    catalogItemId: product.id,
    productName: product.name,
    reusedPending: false,
  };
}
