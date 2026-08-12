/**
 * Phase 3 on-read prospect outreach engagement aggregation.
 * Sums product_outreach system_messages for a prospect (linked + unique-email manuals).
 * Never writes counters or product_outreach_engagement_seen.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { normalizeSystemMessageEmail } from '@/lib/systemMessages';

type Client = SupabaseClient<Database>;

export type ProspectOutreachEngagement = {
  prospectId: number;
  emailsSent: number;
  lastSentAt: string | null;
  openCount: number;
  clickCount: number;
  messagesOpened: number;
  messagesClicked: number;
  distinctProductsOpened: number;
  distinctProductsClicked: number;
  /** Max click_count on any single message (for repeat-click bonuses). */
  maxClickCountOnMessage: number;
  lastOpenedAt: string | null;
  lastClickedAt: string | null;
  lastEngagementAt: string | null;
  suppressed: boolean;
  reply: {
    attributed: boolean;
    confidence: 'none' | 'confirmed_link_after_send';
    lastMessageAt: string | null;
  };
  /** Null-prospect_id manual rows folded in via unique email match. */
  unlinkedManualIncluded: number;
};

export type OutreachMessageRow = {
  id: string;
  prospect_id: number | null;
  to_email: string;
  catalog_item_id: string | null;
  sent_at: string | null;
  open_count: number | null;
  click_count: number | null;
  last_opened_at: string | null;
  last_clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  status?: string | null;
  account_contact_id?: string | null;
};

export type AttributedReplyInput = {
  attributed: boolean;
  confidence: 'none' | 'confirmed_link_after_send';
  lastMessageAt: string | null;
};

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (!Number.isFinite(aMs)) return Number.isFinite(bMs) ? b : a;
  if (!Number.isFinite(bMs)) return a;
  return aMs >= bMs ? a : b;
}

/**
 * Pure aggregation from message rows for one prospect.
 * Caller supplies reply attribution and whether any recipient is suppressed.
 */
export function aggregateProspectOutreachEngagement(params: {
  prospectId: number;
  messages: OutreachMessageRow[];
  suppressed?: boolean;
  reply?: AttributedReplyInput;
  unlinkedManualIncluded?: number;
}): ProspectOutreachEngagement {
  const messages = params.messages.filter((m) => m.sent_at != null);
  let openCount = 0;
  let clickCount = 0;
  let messagesOpened = 0;
  let messagesClicked = 0;
  let maxClickCountOnMessage = 0;
  let lastSentAt: string | null = null;
  let lastOpenedAt: string | null = null;
  let lastClickedAt: string | null = null;

  const productsOpened = new Set<string>();
  const productsClicked = new Set<string>();

  for (const m of messages) {
    const opens = Math.max(0, Number(m.open_count ?? 0));
    const clicks = Math.max(0, Number(m.click_count ?? 0));
    openCount += opens;
    clickCount += clicks;
    if (opens > 0) messagesOpened += 1;
    if (clicks > 0) messagesClicked += 1;
    if (clicks > maxClickCountOnMessage) maxClickCountOnMessage = clicks;
    lastSentAt = maxIso(lastSentAt, m.sent_at);
    lastOpenedAt = maxIso(lastOpenedAt, m.last_opened_at);
    lastClickedAt = maxIso(lastClickedAt, m.last_clicked_at);

    const productId = m.catalog_item_id;
    if (productId) {
      if (opens > 0) productsOpened.add(productId);
      if (clicks > 0) productsClicked.add(productId);
    }
  }

  const reply = params.reply ?? {
    attributed: false,
    confidence: 'none' as const,
    lastMessageAt: null,
  };

  return {
    prospectId: params.prospectId,
    emailsSent: messages.length,
    lastSentAt,
    openCount,
    clickCount,
    messagesOpened,
    messagesClicked,
    distinctProductsOpened: productsOpened.size,
    distinctProductsClicked: productsClicked.size,
    maxClickCountOnMessage,
    lastOpenedAt,
    lastClickedAt,
    lastEngagementAt: maxIso(lastOpenedAt, lastClickedAt),
    suppressed: params.suppressed === true,
    reply,
    unlinkedManualIncluded: params.unlinkedManualIncluded ?? 0,
  };
}

/**
 * High-confidence reply only:
 * confirmed gmail_thread_links + participant or contact match + last_message_at after latest send.
 * Limitation: last_message_at is cache-at-confirm; replies after linking may be missed until relink.
 */
export function attributeConfirmedReply(params: {
  messages: OutreachMessageRow[];
  confirmedLinks: Array<{
    link_status: string;
    participants: string[] | null;
    account_contact_id: string | null;
    last_message_at: string | null;
  }>;
}): AttributedReplyInput {
  const sent = params.messages.filter((m) => m.sent_at != null);
  const latestSentAt = sent.reduce<string | null>((acc, m) => maxIso(acc, m.sent_at), null);
  const latestSentMs = latestSentAt ? Date.parse(latestSentAt) : Number.NaN;
  if (!latestSentAt || !Number.isFinite(latestSentMs)) {
    return { attributed: false, confidence: 'none', lastMessageAt: null };
  }

  const outreachEmails = new Set(
    sent.map((m) => normalizeSystemMessageEmail(m.to_email)).filter((e) => e.length > 0),
  );
  const outreachContactIds = new Set(
    sent
      .map((m) => m.account_contact_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );

  let bestAt: string | null = null;
  for (const link of params.confirmedLinks) {
    if (link.link_status !== 'confirmed') continue;
    const lastMsg = link.last_message_at;
    const lastMsgMs = lastMsg ? Date.parse(lastMsg) : Number.NaN;
    if (!lastMsg || !Number.isFinite(lastMsgMs) || lastMsgMs <= latestSentMs) continue;

    const participants = Array.isArray(link.participants) ? link.participants : [];
    const participantMatch = participants.some((p) => {
      const n = normalizeSystemMessageEmail(p);
      return n.length > 0 && outreachEmails.has(n);
    });
    const contactMatch =
      link.account_contact_id != null && outreachContactIds.has(link.account_contact_id);

    if (!participantMatch && !contactMatch) continue;
    bestAt = maxIso(bestAt, lastMsg);
  }

  if (!bestAt) {
    return { attributed: false, confidence: 'none', lastMessageAt: null };
  }
  return {
    attributed: true,
    confidence: 'confirmed_link_after_send',
    lastMessageAt: bestAt,
  };
}

/** Same bounce/complaint OR semantics as Phase 1 loadSuppressedKeys, scoped to loaded rows. */
export function anyMessageRecipientSuppressed(messages: OutreachMessageRow[]): boolean {
  return messages.some((m) => {
    if (m.bounced_at != null || m.complained_at != null) return true;
    const status = typeof m.status === 'string' ? m.status : '';
    return status === 'bounced' || status === 'complained';
  });
}

const MESSAGE_SELECT =
  'id, prospect_id, to_email, catalog_item_id, sent_at, open_count, click_count, last_opened_at, last_clicked_at, bounced_at, complained_at, status, account_contact_id';

/**
 * Load sent product_outreach for a prospect by prospect_id, plus unlinked manuals
 * whose to_email uniquely matches a contact email on that prospect.
 * Does not write prospect_id back onto messages.
 */
export async function loadOutreachMessagesForProspect(params: {
  client: Client;
  prospectId: number;
  contactEmails: string[];
}): Promise<{ messages: OutreachMessageRow[]; unlinkedManualIncluded: number }> {
  const { data: linked, error: linkedErr } = await params.client
    .from('system_messages')
    .select(MESSAGE_SELECT)
    .eq('message_type', 'product_outreach')
    .eq('prospect_id', params.prospectId)
    .not('sent_at', 'is', null);
  if (linkedErr) throw new Error(linkedErr.message);

  const linkedRows = (linked ?? []) as OutreachMessageRow[];
  const linkedIds = new Set(linkedRows.map((r) => r.id));

  const uniqueEmails = [
    ...new Set(
      params.contactEmails.map((e) => normalizeSystemMessageEmail(e)).filter((e) => e.length > 0),
    ),
  ];

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

    // Only fold in when email uniquely maps to this prospect's contacts (caller responsibility:
    // pass only emails that are unique across CRM for this prospect).
    unlinked = ((candidates ?? []) as OutreachMessageRow[]).filter((r) => !linkedIds.has(r.id));
  }

  return {
    messages: [...linkedRows, ...unlinked],
    unlinkedManualIncluded: unlinked.length,
  };
}

export async function buildProspectOutreachEngagement(params: {
  client: Client;
  prospectId: number;
  contactEmails: string[];
  confirmedLinks: Array<{
    link_status: string;
    participants: string[] | null | unknown;
    account_contact_id: string | null;
    last_message_at: string | null;
  }>;
}): Promise<ProspectOutreachEngagement> {
  const { messages, unlinkedManualIncluded } = await loadOutreachMessagesForProspect({
    client: params.client,
    prospectId: params.prospectId,
    contactEmails: params.contactEmails,
  });

  const links = params.confirmedLinks.map((l) => ({
    link_status: l.link_status,
    participants: Array.isArray(l.participants)
      ? l.participants.filter((p): p is string => typeof p === 'string')
      : null,
    account_contact_id: l.account_contact_id,
    last_message_at: l.last_message_at,
  }));

  const reply = attributeConfirmedReply({ messages, confirmedLinks: links });
  const suppressed = anyMessageRecipientSuppressed(messages);

  return aggregateProspectOutreachEngagement({
    prospectId: params.prospectId,
    messages,
    suppressed,
    reply,
    unlinkedManualIncluded,
  });
}
