/**
 * Phase 3 briefing-ready outreach lead lists (Warm / Hot / Call Today).
 * On-read aggregation — no schema writes, no Resend, no live Gmail fetch.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountStatus, Database } from '@/types/database';
import {
  aggregateProspectOutreachEngagement,
  anyMessageRecipientSuppressed,
  attributeConfirmedReply,
  type OutreachMessageRow,
  type ProspectOutreachEngagement,
} from '@/lib/outreachEngagementAggregate';
import { listConfirmedLinksForProspect } from '@/lib/google/gmailThreadLinks';
import { OUTREACH_LEAD_RULES_VERSION } from '@/lib/outreachLeadRules';
import {
  evaluateLeadState,
  type CallTodayReason,
  type OutreachLeadState,
} from '@/lib/outreachLeadState';
import { formatOutreachPreparationDate } from '@/lib/outreachSelectTargets';
import { AGENT_OUTREACH_PREP_TZ } from '@/lib/outreachSelectionConstants';
import { normalizeSystemMessageEmail } from '@/lib/systemMessages';
import { fetchDueCallFollowUps } from '@/lib/calls';

type Client = SupabaseClient<Database>;

export type OutreachLeadRow = {
  prospectId: number;
  prospectName: string;
  accountStatus: AccountStatus;
  leadState: OutreachLeadState;
  callToday: boolean;
  callTodayReasons: CallTodayReason[];
  score: number;
  rulesVersion: typeof OUTREACH_LEAD_RULES_VERSION;
  engagement: ProspectOutreachEngagement;
};

export type OutreachLeadKind = 'warm' | 'hot' | 'call_today';

const MESSAGE_SELECT =
  'id, prospect_id, to_email, catalog_item_id, sent_at, open_count, click_count, last_opened_at, last_clicked_at, bounced_at, complained_at, status, account_contact_id';

/**
 * Build unique-email → prospectId map from account_contacts.
 * Ambiguous emails (multiple contacts / prospects) are omitted.
 */
export async function loadUniqueContactEmailToProspectId(
  client: Client,
): Promise<Map<string, number>> {
  const { data, error } = await client.from('account_contacts').select('account_id, email');
  if (error) throw new Error(error.message);

  const counts = new Map<string, Set<number>>();
  for (const row of data ?? []) {
    if (typeof row.email !== 'string' || !row.email.trim()) continue;
    if (typeof row.account_id !== 'number' || !Number.isFinite(row.account_id)) continue;
    const email = normalizeSystemMessageEmail(row.email);
    if (!email) continue;
    const set = counts.get(email) ?? new Set<number>();
    set.add(row.account_id);
    counts.set(email, set);
  }

  const unique = new Map<string, number>();
  for (const [email, prospectIds] of counts) {
    if (prospectIds.size === 1) {
      const only = [...prospectIds][0];
      if (only != null) unique.set(email, only);
    }
  }
  return unique;
}

export async function loadUniqueContactEmailsForProspect(params: {
  client: Client;
  prospectId: number;
}): Promise<string[]> {
  const map = await loadUniqueContactEmailToProspectId(params.client);
  const emails: string[] = [];
  for (const [email, prospectId] of map) {
    if (prospectId === params.prospectId) emails.push(email);
  }
  return emails;
}

async function loadProspectMeta(
  client: Client,
  prospectIds: number[],
): Promise<Map<number, { name: string; accountStatus: AccountStatus }>> {
  const out = new Map<number, { name: string; accountStatus: AccountStatus }>();
  if (prospectIds.length === 0) return out;
  const { data, error } = await client
    .from('prospects')
    .select('id, name, account_status')
    .in('id', prospectIds);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    out.set(row.id, {
      name: row.name,
      accountStatus: row.account_status as AccountStatus,
    });
  }
  return out;
}

/**
 * Evaluate lead state for a single prospect (drawer chip / Briefing deep link).
 */
export async function getOutreachLeadForProspect(params: {
  client: Client;
  prospectId: number;
  asOf?: Date;
}): Promise<OutreachLeadRow | null> {
  const asOf = params.asOf ?? new Date();
  const uniqueEmails = await loadUniqueContactEmailsForProspect({
    client: params.client,
    prospectId: params.prospectId,
  });

  const { data: linked, error: linkedErr } = await params.client
    .from('system_messages')
    .select(MESSAGE_SELECT)
    .eq('message_type', 'product_outreach')
    .eq('prospect_id', params.prospectId)
    .not('sent_at', 'is', null);
  if (linkedErr) throw new Error(linkedErr.message);

  let unlinked: OutreachMessageRow[] = [];
  if (uniqueEmails.length > 0) {
    const { data: candidates, error: candErr } = await params.client
      .from('system_messages')
      .select(MESSAGE_SELECT)
      .eq('message_type', 'product_outreach')
      .is('prospect_id', null)
      .not('sent_at', 'is', null)
      .in('to_email', uniqueEmails);
    if (candErr) throw new Error(candErr.message);
    unlinked = (candidates ?? []) as OutreachMessageRow[];
  }

  const messages = [...((linked ?? []) as OutreachMessageRow[]), ...unlinked];
  if (messages.length === 0) {
    const meta = await loadProspectMeta(params.client, [params.prospectId]);
    const prospect = meta.get(params.prospectId);
    if (!prospect) return null;
    const engagement = aggregateProspectOutreachEngagement({
      prospectId: params.prospectId,
      messages: [],
      suppressed: false,
      unlinkedManualIncluded: 0,
    });
    const followUps = await fetchDueCallFollowUps(params.client, {
      asOf,
      prospectIds: [params.prospectId],
    });
    const evaluated = evaluateLeadState({
      engagement,
      followUpDue: followUps.has(params.prospectId),
      asOf,
    });
    return {
      prospectId: params.prospectId,
      prospectName: prospect.name,
      accountStatus: prospect.accountStatus,
      leadState: evaluated.leadState,
      callToday: evaluated.callToday,
      callTodayReasons: evaluated.callTodayReasons,
      score: evaluated.score,
      rulesVersion: evaluated.rulesVersion,
      engagement,
    };
  }

  const confirmedLinks = await listConfirmedLinksForProspect({
    client: params.client,
    prospectId: params.prospectId,
  });
  const reply = attributeConfirmedReply({
    messages,
    confirmedLinks: confirmedLinks.map((l) => ({
      link_status: l.link_status,
      participants: Array.isArray(l.participants)
        ? l.participants.filter((p): p is string => typeof p === 'string')
        : null,
      account_contact_id: l.account_contact_id,
      last_message_at: l.last_message_at,
    })),
  });
  const engagement = aggregateProspectOutreachEngagement({
    prospectId: params.prospectId,
    messages,
    suppressed: anyMessageRecipientSuppressed(messages),
    reply,
    unlinkedManualIncluded: unlinked.length,
  });

  const followUps = await fetchDueCallFollowUps(params.client, {
    asOf,
    prospectIds: [params.prospectId],
  });
  const evaluated = evaluateLeadState({
    engagement,
    followUpDue: followUps.has(params.prospectId),
    asOf,
  });

  const meta = await loadProspectMeta(params.client, [params.prospectId]);
  const prospect = meta.get(params.prospectId);
  if (!prospect) return null;

  return {
    prospectId: params.prospectId,
    prospectName: prospect.name,
    accountStatus: prospect.accountStatus,
    leadState: evaluated.leadState,
    callToday: evaluated.callToday,
    callTodayReasons: evaluated.callTodayReasons,
    score: evaluated.score,
    rulesVersion: evaluated.rulesVersion,
    engagement,
  };
}

export async function listOutreachLeads(
  client: Client,
  options?: {
    kinds?: OutreachLeadKind[];
    asOf?: Date;
  },
): Promise<OutreachLeadRow[]> {
  const asOf = options?.asOf ?? new Date();
  const kinds = options?.kinds;

  const { data: sentRows, error: sentErr } = await client
    .from('system_messages')
    .select(MESSAGE_SELECT)
    .eq('message_type', 'product_outreach')
    .not('sent_at', 'is', null);
  if (sentErr) throw new Error(sentErr.message);

  const emailToProspect = await loadUniqueContactEmailToProspectId(client);
  const byProspect = new Map<number, { messages: OutreachMessageRow[]; unlinked: number }>();

  for (const raw of sentRows ?? []) {
    const row = raw as OutreachMessageRow;
    let prospectId: number | null =
      typeof row.prospect_id === 'number' && Number.isFinite(row.prospect_id)
        ? row.prospect_id
        : null;
    let unlinked = false;
    if (prospectId == null) {
      const email = normalizeSystemMessageEmail(row.to_email);
      const mapped = email ? emailToProspect.get(email) : undefined;
      if (mapped == null) continue;
      prospectId = mapped;
      unlinked = true;
    }
    const bucket = byProspect.get(prospectId) ?? { messages: [], unlinked: 0 };
    bucket.messages.push(row);
    if (unlinked) bucket.unlinked += 1;
    byProspect.set(prospectId, bucket);
  }

  // Include prospects with follow-up due even if no outreach yet (Call Today via follow_up_due).
  const dueFollowUps = await fetchDueCallFollowUps(client, { asOf });
  for (const prospectId of dueFollowUps) {
    if (!byProspect.has(prospectId)) {
      byProspect.set(prospectId, { messages: [], unlinked: 0 });
    }
  }

  const prospectIds = [...byProspect.keys()];
  const meta = await loadProspectMeta(client, prospectIds);
  const rows: OutreachLeadRow[] = [];

  for (const prospectId of prospectIds) {
    const bucket = byProspect.get(prospectId);
    if (!bucket) continue;
    const prospect = meta.get(prospectId);
    if (!prospect) continue;

    const confirmedLinks =
      bucket.messages.length > 0 ? await listConfirmedLinksForProspect({ client, prospectId }) : [];
    const reply = attributeConfirmedReply({
      messages: bucket.messages,
      confirmedLinks: confirmedLinks.map((l) => ({
        link_status: l.link_status,
        participants: Array.isArray(l.participants)
          ? l.participants.filter((p): p is string => typeof p === 'string')
          : null,
        account_contact_id: l.account_contact_id,
        last_message_at: l.last_message_at,
      })),
    });
    const engagement = aggregateProspectOutreachEngagement({
      prospectId,
      messages: bucket.messages,
      suppressed: anyMessageRecipientSuppressed(bucket.messages),
      reply,
      unlinkedManualIncluded: bucket.unlinked,
    });
    const evaluated = evaluateLeadState({
      engagement,
      followUpDue: dueFollowUps.has(prospectId),
      asOf,
    });

    const row: OutreachLeadRow = {
      prospectId,
      prospectName: prospect.name,
      accountStatus: prospect.accountStatus,
      leadState: evaluated.leadState,
      callToday: evaluated.callToday,
      callTodayReasons: evaluated.callTodayReasons,
      score: evaluated.score,
      rulesVersion: evaluated.rulesVersion,
      engagement,
    };

    if (!kinds || kinds.length === 0) {
      rows.push(row);
      continue;
    }
    const match =
      (kinds.includes('warm') && row.leadState === 'warm') ||
      (kinds.includes('hot') && row.leadState === 'hot') ||
      (kinds.includes('call_today') && row.callToday);
    if (match) rows.push(row);
  }

  rows.sort((a, b) => b.score - a.score || a.prospectName.localeCompare(b.prospectName));
  return rows;
}

export async function listWarmLeads(client: Client, asOf?: Date): Promise<OutreachLeadRow[]> {
  return listOutreachLeads(client, { kinds: ['warm'], asOf });
}

export async function listHotLeads(client: Client, asOf?: Date): Promise<OutreachLeadRow[]> {
  return listOutreachLeads(client, { kinds: ['hot'], asOf });
}

export async function listCallToday(client: Client, asOf?: Date): Promise<OutreachLeadRow[]> {
  return listOutreachLeads(client, { kinds: ['call_today'], asOf });
}

/** YYYY-MM-DD today in outreach prep TZ (for follow-up comparisons). */
export function outreachTodayDate(asOf: Date = new Date()): string {
  return formatOutreachPreparationDate(asOf, AGENT_OUTREACH_PREP_TZ);
}
