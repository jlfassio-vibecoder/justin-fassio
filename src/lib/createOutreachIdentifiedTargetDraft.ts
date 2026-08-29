/**
 * Per-account draft for a research-queue identified target.
 * Uses the frozen product from the latest regional prep run + live contact email.
 * Does not re-run regional prep or product selection. Never calls Resend.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACCOUNT_CONTACT_SELECT,
  mapAccountContactRow,
  type AccountContact,
} from '@/lib/accountContacts';
import { isPrimaryRetailChannel } from '@/lib/crmRetailTaxonomy';
import { generateOgrProductOutreachDraft } from '@/lib/generateOgrProductOutreachDraft';
import { parseIdentifiedTargetsFromPrepAllocation } from '@/lib/outreachBriefingShared';
import { pickOutreachContact, resolveProspectOutreachChannels } from '@/lib/outreachEligibility';
import { getLatestRegionalOutreachPrepRun } from '@/lib/outreachNightlyPrep';
import type { SelectedOutreachTarget } from '@/lib/outreachSelectTargets';
import { AGENT_OUTREACH_PENDING_DRAFT_STATUSES } from '@/lib/outreachSelectionConstants';
import { mapProspectRow, PROSPECT_SELECT, type ProspectListRow } from '@/lib/prospects';
import {
  escapeIlikeExact,
  listAgentProductOutreachDrafts,
  normalizeSystemMessageEmail,
  SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH,
} from '@/lib/systemMessages';
import type { AccountContact as AccountContactRow, Database } from '@/types/database';

type Client = SupabaseClient<Database>;

export type CreateOutreachIdentifiedTargetDraftResult =
  | {
      ok: true;
      draftId: string;
      catalogItemId: string;
      productName: string;
      reusedPending: boolean;
    }
  | { ok: false; error: string; status: 400 | 404 | 409 | 502 };

const SUPPRESSION_OR =
  'bounced_at.not.is.null,complained_at.not.is.null,status.eq.bounced,status.eq.complained';

async function isOutreachEmailSuppressed(
  client: Client,
  params: { prospectId: number; toEmail: string },
): Promise<{ ok: true; suppressed: boolean } | { ok: false; error: string }> {
  const email = normalizeSystemMessageEmail(params.toEmail);

  const byProspect = await client
    .from('system_messages')
    .select('id')
    .eq('message_type', SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH)
    .eq('prospect_id', params.prospectId)
    .or(SUPPRESSION_OR)
    .limit(1);
  if (byProspect.error) return { ok: false, error: byProspect.error.message };
  if ((byProspect.data?.length ?? 0) > 0) return { ok: true, suppressed: true };

  const byEmail = await client
    .from('system_messages')
    .select('to_email')
    .eq('message_type', SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH)
    .or(SUPPRESSION_OR)
    .ilike('to_email', escapeIlikeExact(email))
    .limit(10);
  if (byEmail.error) return { ok: false, error: byEmail.error.message };
  const suppressed = (byEmail.data ?? []).some(
    (row) =>
      typeof row.to_email === 'string' && normalizeSystemMessageEmail(row.to_email) === email,
  );
  return { ok: true, suppressed };
}

export async function createOutreachIdentifiedTargetDraft(params: {
  client: Client;
  prospectId: number;
  catalogItemId: string;
  operationalTerritoryId: string;
  storeTerritoryCode?: string | null;
  crmRegion?: string | null;
  city?: string | null;
  preparationDate: string;
  userId: string | null;
  salesLineId?: string | null;
  retailerLineAccountId?: string | null;
}): Promise<CreateOutreachIdentifiedTargetDraftResult> {
  const prospectId = params.prospectId;
  const catalogItemId = params.catalogItemId.trim();
  if (!catalogItemId) {
    return { ok: false, error: 'catalogItemId is required', status: 400 };
  }

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

  const runLookup = await getLatestRegionalOutreachPrepRun(params.client, {
    operationalTerritoryId: params.operationalTerritoryId,
    storeTerritoryCode: params.storeTerritoryCode,
    crmRegion: params.crmRegion,
    city: params.city,
  });
  if (!runLookup.ok) return { ok: false, error: runLookup.error, status: 502 };
  if (!runLookup.run) {
    return { ok: false, error: 'No regional prep run found for this scope', status: 404 };
  }

  const identified = parseIdentifiedTargetsFromPrepAllocation(runLookup.run.channelAllocation);
  const frozen = identified.find(
    (t) => t.prospectId === prospectId && t.catalogItemId === catalogItemId,
  );
  if (!frozen) {
    return {
      ok: false,
      error: 'Account is not an identified target on the latest regional prep for this scope',
      status: 404,
    };
  }

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

  const suppression = await isOutreachEmailSuppressed(params.client, {
    prospectId,
    toEmail: picked.toEmail,
  });
  if (!suppression.ok) return { ok: false, error: suppression.error, status: 502 };
  if (suppression.suppressed) {
    return { ok: false, error: 'Contact email is suppressed (bounce or complaint)', status: 409 };
  }

  const channels = resolveProspectOutreachChannels(prospect);
  const primaryChannel =
    frozen.primaryChannel && isPrimaryRetailChannel(frozen.primaryChannel)
      ? frozen.primaryChannel
      : channels.primaryChannel;

  const target: SelectedOutreachTarget = {
    preparationDate: params.preparationDate,
    prospectId,
    prospectName: frozen.prospectName || prospect.name,
    accountContactId: picked.contact.id,
    toEmail: picked.toEmail,
    toName: picked.contact.fullName?.trim() || prospect.name,
    needsEmail: false,
    primaryChannel,
    secondaryChannels: channels.secondaryChannels,
    catalogItemId: frozen.catalogItemId,
    productSku: frozen.productSku,
    productName: frozen.productName,
    productSlug: frozen.productSlug,
    productIsNew: false,
    productSalesRank: null,
    selectionReasons: {
      priority: prospect.priority,
      fitScore: prospect.fitScore,
      channelMatch: Boolean(primaryChannel),
      productFit: 'channel_intersect',
      exclusionsChecked: true,
    },
  };

  const generated = await generateOgrProductOutreachDraft(params.client, {
    target,
    userId: params.userId,
    automationRunId: runLookup.run.id,
    salesLineId: params.salesLineId ?? undefined,
    retailerLineAccountId: params.retailerLineAccountId,
    copyMode: 'generic_stub',
  });
  if (!generated.ok) return { ok: false, error: generated.error, status: 502 };

  return {
    ok: true,
    draftId: generated.draftId,
    catalogItemId: frozen.catalogItemId,
    productName: frozen.productName || generated.subject,
    reusedPending: false,
  };
}
