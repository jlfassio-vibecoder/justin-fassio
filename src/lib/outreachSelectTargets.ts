/**
 * Phase 1 orchestrator: hard eligibility → channel allocation → deterministic rank → product fit
 * → frozen SelectedOutreachTarget DTO for Phase 2 (Phase 2 must not re-run eligibility).
 *
 * Schema: none in v1. Suppression, cooldown, and pending drafts are query-derived from
 * system_messages. Upgrade path: denormalized contact suppression flags / unique pending-draft index.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACCOUNT_CONTACT_SELECT,
  mapAccountContactRow,
  type AccountContact,
} from '@/lib/accountContacts';
import type { PrimaryRetailChannel } from '@/lib/crmRetailTaxonomy';
import {
  allocateChannelsForDay,
  type AllocateChannelsForDayResult,
} from '@/lib/outreachChannelAllocation';
import {
  compareOutreachProspectRank,
  isRlaInOutreachPool,
  isWithinOutreachCooldown,
  pickOutreachContact,
  prospectPassesOutreachPool,
  resolveProspectOutreachChannels,
  type OutreachExclusionReason,
} from '@/lib/outreachEligibility';
import { loadOutreachProductPool, selectProductForProspect } from '@/lib/outreachProductSelection';
import type { ProductWeightSource } from '@/lib/outreachProductWeights';
import {
  AGENT_OUTREACH_COOLDOWN_DAYS,
  AGENT_OUTREACH_PENDING_DRAFT_STATUSES,
  AGENT_OUTREACH_PREP_TZ,
} from '@/lib/outreachSelectionConstants';
import { mapProspectRow, PROSPECT_SELECT, type Prospect } from '@/lib/prospects';
import {
  fetchPendingAgentProductOutreachProspectIds,
  normalizeSystemMessageEmail,
  SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH,
} from '@/lib/systemMessages';
import type { AccountContact as AccountContactRow, Database } from '@/types/database';

type DbClient = SupabaseClient<Database>;

export type SelectedOutreachTarget = {
  preparationDate: string;
  prospectId: number;
  prospectName: string;
  accountContactId: string;
  toEmail: string;
  toName: string;
  primaryChannel: PrimaryRetailChannel | null;
  secondaryChannels: PrimaryRetailChannel[];
  catalogItemId: string;
  productSku: string;
  productName: string;
  productSlug: string;
  productIsNew: boolean;
  productSalesRank: number | null;
  selectionReasons: {
    priority: string | null;
    fitScore: number | null;
    channelMatch: boolean;
    productFit: 'channel_intersect' | 'global_fallback';
    productWeightSource?: ProductWeightSource;
    exclusionsChecked: true;
  };
};

export type SelectOutreachTargetsInput = {
  preparationDate?: string;
  capacity: number;
  weights?: Parameters<typeof allocateChannelsForDay>[0]['weights'];
  /** When provided, skips internal allocateChannelsForDay (nightly prep uses one shared allocation). */
  channelAllocation?: AllocateChannelsForDayResult;
  productWeights?: Map<string, number>;
  globalProductWeight?: number;
  productWeightSource?: ProductWeightSource;
  /** Injectable clock for cooldown / prep-date derivation. */
  asOf?: Date;
};

export type SelectOutreachTargetsResult =
  | {
      ok: true;
      targets: SelectedOutreachTarget[];
      excluded: { prospectId: number; reason: OutreachExclusionReason | string }[];
    }
  | { ok: false; error: string };

/** YYYY-MM-DD in America/Vancouver (or override TZ). */
export function formatOutreachPreparationDate(
  date: Date = new Date(),
  timeZone: string = AGENT_OUTREACH_PREP_TZ,
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

async function loadProspectAccounts(
  client: DbClient,
): Promise<{ ok: true; prospects: Prospect[] } | { ok: false; error: string }> {
  const { data: ogr, error: ogrError } = await client
    .from('lines')
    .select('id')
    .eq('code', 'ogr')
    .maybeSingle();
  if (ogrError) return { ok: false, error: ogrError.message };
  if (!ogr) return { ok: false, error: 'OGR sales line not found' };

  const { data: rlas, error: rlaError } = await client
    .from('retailer_line_accounts')
    .select('retailer_id, relationship_status, line_account_markers')
    .eq('sales_line_id', ogr.id)
    .in('relationship_status', ['prospect', 'opened']);
  if (rlaError) return { ok: false, error: rlaError.message };
  const ids = [
    ...new Set(
      (rlas ?? [])
        .filter((row) =>
          isRlaInOutreachPool({
            relationshipStatus: row.relationship_status,
            markers: row.line_account_markers,
          }),
        )
        .map((row) => row.retailer_id)
        .filter((id) => Number.isFinite(id)),
    ),
  ];
  if (ids.length === 0) {
    return { ok: true, prospects: [] };
  }

  const { data, error } = await client
    .from('prospects')
    .select(PROSPECT_SELECT)
    .in('id', ids)
    .order('id', { ascending: true });

  if (error) {
    return { ok: false, error: error.message };
  }

  const idSet = new Set(ids);
  return {
    ok: true,
    prospects: (data ?? []).map((row) => mapProspectRow(row)).filter((p) => idSet.has(p.id)),
  };
}

async function loadContactsByAccountId(
  client: DbClient,
  accountIds: number[],
): Promise<
  { ok: true; byAccountId: Map<number, AccountContact[]> } | { ok: false; error: string }
> {
  const byAccountId = new Map<number, AccountContact[]>();
  if (accountIds.length === 0) {
    return { ok: true, byAccountId };
  }

  const { data, error } = await client
    .from('account_contacts')
    .select(ACCOUNT_CONTACT_SELECT)
    .in('account_id', accountIds)
    .order('is_primary', { ascending: false })
    .order('full_name', { ascending: true });

  if (error) {
    return { ok: false, error: error.message };
  }

  for (const raw of (data ?? []) as AccountContactRow[]) {
    const contact = mapAccountContactRow(raw);
    const list = byAccountId.get(contact.accountId) ?? [];
    list.push(contact);
    byAccountId.set(contact.accountId, list);
  }

  return { ok: true, byAccountId };
}

async function loadSuppressedKeys(
  client: DbClient,
): Promise<
  { ok: true; emails: Set<string>; prospectIds: Set<number> } | { ok: false; error: string }
> {
  const { data, error } = await client
    .from('system_messages')
    .select('prospect_id, to_email, status, bounced_at, complained_at')
    .eq('message_type', SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH)
    .or(
      [
        'bounced_at.not.is.null',
        'complained_at.not.is.null',
        'status.eq.bounced',
        'status.eq.complained',
      ].join(','),
    );

  if (error) {
    return { ok: false, error: error.message };
  }

  const emails = new Set<string>();
  const prospectIds = new Set<number>();
  for (const row of data ?? []) {
    if (typeof row.to_email === 'string' && row.to_email.trim()) {
      emails.add(normalizeSystemMessageEmail(row.to_email));
    }
    if (typeof row.prospect_id === 'number' && Number.isFinite(row.prospect_id)) {
      prospectIds.add(row.prospect_id);
    }
  }
  return { ok: true, emails, prospectIds };
}

function rememberLatestSend(
  row: { prospect_id: number | null; to_email: string; sent_at: string | null },
  byProspectId: Map<number, string>,
  byEmail: Map<string, string>,
): void {
  if (!row.sent_at) return;
  if (
    typeof row.prospect_id === 'number' &&
    Number.isFinite(row.prospect_id) &&
    !byProspectId.has(row.prospect_id)
  ) {
    byProspectId.set(row.prospect_id, row.sent_at);
  }
  if (typeof row.to_email === 'string' && row.to_email.trim()) {
    const email = normalizeSystemMessageEmail(row.to_email);
    if (!byEmail.has(email)) {
      byEmail.set(email, row.sent_at);
    }
  }
}

async function loadLatestSends(
  client: DbClient,
  prospectIds: number[],
  emails: string[],
): Promise<
  | {
      ok: true;
      byProspectId: Map<number, string>;
      byEmail: Map<string, string>;
    }
  | { ok: false; error: string }
> {
  const byProspectId = new Map<number, string>();
  const byEmail = new Map<string, string>();
  if (prospectIds.length === 0 && emails.length === 0) {
    return { ok: true, byProspectId, byEmail };
  }

  if (prospectIds.length > 0) {
    const { data, error } = await client
      .from('system_messages')
      .select('prospect_id, to_email, sent_at')
      .eq('message_type', SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH)
      .not('sent_at', 'is', null)
      .in('prospect_id', prospectIds)
      .order('sent_at', { ascending: false });

    if (error) {
      return { ok: false, error: error.message };
    }
    for (const row of data ?? []) {
      rememberLatestSend(row, byProspectId, byEmail);
    }
  }

  if (emails.length > 0) {
    const { data, error } = await client
      .from('system_messages')
      .select('prospect_id, to_email, sent_at')
      .eq('message_type', SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH)
      .not('sent_at', 'is', null)
      .in('to_email', emails)
      .order('sent_at', { ascending: false });

    if (error) {
      return { ok: false, error: error.message };
    }
    for (const row of data ?? []) {
      rememberLatestSend(row, byProspectId, byEmail);
    }
  }

  return { ok: true, byProspectId, byEmail };
}

function latestSentAt(
  prospectId: number,
  toEmail: string,
  byProspectId: Map<number, string>,
  byEmail: Map<string, string>,
): string | null {
  const a = byProspectId.get(prospectId) ?? null;
  const b = byEmail.get(toEmail) ?? null;
  if (a && b) {
    return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
  }
  return a ?? b;
}

type EligibleCandidate = {
  prospect: Prospect;
  contact: AccountContact;
  toEmail: string;
  primaryChannel: PrimaryRetailChannel | null;
  secondaryChannels: PrimaryRetailChannel[];
  allChannels: PrimaryRetailChannel[];
  lastSentAt: string | null;
};

/**
 * Select up to `capacity` outreach targets for a preparation day.
 * Soft channel caps: fill preferred allocation channels first, then spill to remaining eligible.
 */
export async function selectOutreachTargets(
  client: DbClient,
  input: SelectOutreachTargetsInput,
): Promise<SelectOutreachTargetsResult> {
  const asOf = input.asOf ?? new Date();
  const preparationDate = input.preparationDate ?? formatOutreachPreparationDate(asOf);
  const capacity = Math.max(0, Math.floor(input.capacity));
  const excluded: { prospectId: number; reason: OutreachExclusionReason | string }[] = [];

  if (capacity === 0) {
    return { ok: true, targets: [], excluded };
  }

  const allocation =
    input.channelAllocation ??
    allocateChannelsForDay({
      preparationDate,
      capacity,
      weights: input.weights,
    });
  const allocatedWithSlots = new Set(
    allocation.channelOrder.filter((ch) => (allocation.slotsByChannel[ch] ?? 0) > 0),
  );

  const [prospectsResult, poolResult, pendingResult, suppressedResult] = await Promise.all([
    loadProspectAccounts(client),
    loadOutreachProductPool(client),
    fetchPendingAgentProductOutreachProspectIds(client, AGENT_OUTREACH_PENDING_DRAFT_STATUSES),
    loadSuppressedKeys(client),
  ]);

  if (!prospectsResult.ok) return { ok: false, error: prospectsResult.error };
  if (!poolResult.ok) return { ok: false, error: poolResult.error };
  if (!pendingResult.ok) return { ok: false, error: pendingResult.error };
  if (!suppressedResult.ok) return { ok: false, error: suppressedResult.error };

  const prospects = prospectsResult.prospects.filter((p) => {
    // Copilot suggestion ignored: load already drops inactive RLAs; renaming this leftover gate would expand the exclusion union without a consumer.
    if (!prospectPassesOutreachPool(p)) {
      excluded.push({ prospectId: p.id, reason: 'not_prospect' });
      return false;
    }
    return true;
  });

  const contactsResult = await loadContactsByAccountId(
    client,
    prospects.map((p) => p.id),
  );
  if (!contactsResult.ok) return { ok: false, error: contactsResult.error };

  type Picked = {
    prospect: Prospect;
    contact: AccountContact;
    toEmail: string;
  };
  const pickedRows: Picked[] = [];
  for (const prospect of prospects) {
    if (pendingResult.prospectIds.has(prospect.id)) {
      excluded.push({ prospectId: prospect.id, reason: 'pending_agent_draft' });
      continue;
    }

    const picked = pickOutreachContact(contactsResult.byAccountId.get(prospect.id) ?? []);
    if (!picked) {
      excluded.push({ prospectId: prospect.id, reason: 'no_usable_email' });
      continue;
    }

    if (
      suppressedResult.emails.has(picked.toEmail) ||
      suppressedResult.prospectIds.has(prospect.id)
    ) {
      excluded.push({ prospectId: prospect.id, reason: 'contact_suppressed' });
      continue;
    }

    pickedRows.push({ prospect, contact: picked.contact, toEmail: picked.toEmail });
  }

  const sendsResult = await loadLatestSends(
    client,
    pickedRows.map((row) => row.prospect.id),
    [...new Set(pickedRows.map((row) => row.toEmail))],
  );
  if (!sendsResult.ok) return { ok: false, error: sendsResult.error };

  const eligible: EligibleCandidate[] = [];

  for (const row of pickedRows) {
    const lastSentAt = latestSentAt(
      row.prospect.id,
      row.toEmail,
      sendsResult.byProspectId,
      sendsResult.byEmail,
    );
    if (
      isWithinOutreachCooldown(lastSentAt, {
        asOf,
        cooldownDays: AGENT_OUTREACH_COOLDOWN_DAYS,
      })
    ) {
      excluded.push({ prospectId: row.prospect.id, reason: 'cooldown' });
      continue;
    }

    const channels = resolveProspectOutreachChannels(row.prospect);
    eligible.push({
      prospect: row.prospect,
      contact: row.contact,
      toEmail: row.toEmail,
      primaryChannel: channels.primaryChannel,
      secondaryChannels: channels.secondaryChannels,
      allChannels: channels.allChannels,
      lastSentAt,
    });
  }

  eligible.sort((a, b) =>
    compareOutreachProspectRank(
      {
        id: a.prospect.id,
        priority: a.prospect.priority,
        fitScore: a.prospect.fitScore,
        provisionalGrade: a.prospect.provisionalGrade,
        primaryChannel: a.primaryChannel,
        secondaryChannels: a.secondaryChannels,
        lastSentAt: a.lastSentAt,
      },
      {
        id: b.prospect.id,
        priority: b.prospect.priority,
        fitScore: b.prospect.fitScore,
        provisionalGrade: b.prospect.provisionalGrade,
        primaryChannel: b.primaryChannel,
        secondaryChannels: b.secondaryChannels,
        lastSentAt: b.lastSentAt,
      },
      { allocatedChannels: allocatedWithSlots },
    ),
  );

  const remainingSlots = { ...allocation.slotsByChannel };
  const claimedEmails = new Set<string>();
  const claimedProspects = new Set<number>();
  const targets: SelectedOutreachTarget[] = [];
  const spill: EligibleCandidate[] = [];

  const trySelect = (candidate: EligibleCandidate, preferChannelSlot: boolean): boolean => {
    if (targets.length >= capacity) return false;
    if (claimedProspects.has(candidate.prospect.id)) {
      excluded.push({ prospectId: candidate.prospect.id, reason: 'prospect_already_selected' });
      return false;
    }
    if (claimedEmails.has(candidate.toEmail)) {
      excluded.push({ prospectId: candidate.prospect.id, reason: 'email_already_selected' });
      return false;
    }

    if (preferChannelSlot) {
      const matching = candidate.allChannels.find((ch) => (remainingSlots[ch] ?? 0) > 0);
      if (!matching) return false;
      remainingSlots[matching] = (remainingSlots[matching] ?? 0) - 1;
    }

    const productPick = selectProductForProspect(poolResult.pool, {
      prospectChannels: candidate.allChannels,
      prospectLifestyleThemes: candidate.prospect.lifestyleThemes,
      productWeights: input.productWeights,
      globalProductWeight: input.globalProductWeight,
      productWeightSource: input.productWeightSource,
    });
    if (!productPick) {
      excluded.push({ prospectId: candidate.prospect.id, reason: 'no_product_in_pool' });
      return false;
    }

    const channelMatch = candidate.allChannels.some((ch) => allocatedWithSlots.has(ch));

    claimedProspects.add(candidate.prospect.id);
    claimedEmails.add(candidate.toEmail);
    targets.push({
      preparationDate,
      prospectId: candidate.prospect.id,
      prospectName: candidate.prospect.name,
      accountContactId: candidate.contact.id,
      toEmail: candidate.toEmail,
      toName: candidate.contact.fullName,
      primaryChannel: candidate.primaryChannel,
      secondaryChannels: candidate.secondaryChannels,
      catalogItemId: productPick.product.id,
      productSku: productPick.product.sku,
      productName: productPick.product.name,
      productSlug: productPick.product.publicSlug,
      productIsNew: productPick.product.isNew,
      productSalesRank: productPick.product.salesRank,
      selectionReasons: {
        priority: candidate.prospect.priority,
        fitScore: candidate.prospect.fitScore,
        channelMatch,
        productFit: productPick.productFit,
        productWeightSource: input.productWeightSource,
        exclusionsChecked: true,
      },
    });
    return true;
  };

  for (const candidate of eligible) {
    if (targets.length >= capacity) break;
    const matched = trySelect(candidate, true);
    if (
      !matched &&
      !claimedProspects.has(candidate.prospect.id) &&
      !claimedEmails.has(candidate.toEmail)
    ) {
      // Only spill if not already excluded inside trySelect for product/email reasons
      const alreadyExcluded = excluded.some((e) => e.prospectId === candidate.prospect.id);
      if (!alreadyExcluded) {
        spill.push(candidate);
      }
    }
  }

  for (const candidate of spill) {
    if (targets.length >= capacity) break;
    trySelect(candidate, false);
  }

  return { ok: true, targets, excluded };
}
