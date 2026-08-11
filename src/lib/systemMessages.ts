import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Database, SystemMessageInsert } from '@/types/database';

type DbClient = SupabaseClient<Database>;

export const SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH = 'product_outreach' as const;
export const SYSTEM_MESSAGE_ORIGIN_MANUAL_PRODUCT_EMAIL = 'manual_product_email' as const;

export const PRODUCT_OUTREACH_HISTORY_SELECT =
  'id, to_email, to_name, subject, status, sent_at, prospect_id, account_contact_id, created_at, open_count, click_count, opened_at, clicked_at, delivered_at, bounced_at, failed_at, failure_reason' as const;

export const PRODUCT_OUTREACH_HISTORY_LIMIT = 50;

export type ProductOutreachHistoryItem = {
  id: string;
  toEmail: string;
  toName: string | null;
  subject: string;
  status: string;
  sentAt: string | null;
  prospectId: number | null;
  accountContactId: string | null;
  prospectName: string | null;
  contactName: string | null;
  createdAt: string;
  openCount: number;
  clickCount: number;
  openedAt: string | null;
  clickedAt: string | null;
  deliveredAt: string | null;
  bouncedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
};

export type ProductOutreachCrmAssociation = {
  prospectId: number | null;
  accountContactId: string | null;
};

export type ProductOutreachSystemMessagePayload = {
  sku: string;
  name: string;
  slug: string;
  productHref: string;
  from?: string;
};

export type InsertProductOutreachSystemMessageInput = {
  catalogItemId: string;
  resendEmailId: string;
  toEmail: string;
  toName?: string | null;
  subject: string;
  prospectId?: number | null;
  accountContactId?: string | null;
  sentBy: string;
  payload: ProductOutreachSystemMessagePayload;
};

function escapeIlikeExact(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function normalizeSystemMessageEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Exact case-insensitive match on account_contacts.email.
 * Returns association only when exactly one contact matches.
 */
export async function matchUniqueAccountContactByEmail(
  client: DbClient,
  email: string,
): Promise<ProductOutreachCrmAssociation | null> {
  const normalized = normalizeSystemMessageEmail(email);
  if (!normalized) return null;

  const { data, error } = await client
    .from('account_contacts')
    .select('id, account_id, email')
    .ilike('email', escapeIlikeExact(normalized));

  if (error || !data?.length) return null;

  const matches = data.filter((row) => {
    const rowEmail = typeof row.email === 'string' ? normalizeSystemMessageEmail(row.email) : '';
    return rowEmail === normalized;
  });

  if (matches.length !== 1) return null;
  const match = matches[0];
  if (!match || !Number.isFinite(match.account_id)) return null;

  return {
    prospectId: match.account_id,
    accountContactId: match.id,
  };
}

export type ResolveProductOutreachCrmResult =
  { ok: true; association: ProductOutreachCrmAssociation } | { ok: false; error: string };

/**
 * Resolve CRM links for a product outreach send.
 * Explicit prospectId + accountContactId (both required together) win over email match.
 */
export async function resolveProductOutreachCrmAssociation(
  client: DbClient,
  input: {
    prospectId?: number | null;
    accountContactId?: string | null;
    toEmail: string;
  },
): Promise<ResolveProductOutreachCrmResult> {
  const hasProspect = input.prospectId != null;
  const hasContact = input.accountContactId != null && input.accountContactId.trim() !== '';

  if (hasProspect !== hasContact) {
    return {
      ok: false,
      error: 'prospectId and accountContactId must be provided together',
    };
  }

  if (hasProspect && hasContact) {
    const prospectId = input.prospectId as number;
    const accountContactId = (input.accountContactId as string).trim();

    const { data, error } = await client
      .from('account_contacts')
      .select('id, account_id')
      .eq('id', accountContactId)
      .maybeSingle();

    if (error) {
      return { ok: false, error: 'Could not validate account contact' };
    }
    if (!data) {
      return { ok: false, error: 'Account contact not found' };
    }
    if (data.account_id !== prospectId) {
      return { ok: false, error: 'Account contact does not belong to the given prospect' };
    }

    return {
      ok: true,
      association: {
        prospectId,
        accountContactId: data.id,
      },
    };
  }

  const matched = await matchUniqueAccountContactByEmail(client, input.toEmail);
  return {
    ok: true,
    association: matched ?? { prospectId: null, accountContactId: null },
  };
}

export type InsertProductOutreachSystemMessageResult =
  { ok: true; id: string } | { ok: false; error: string };

export async function insertProductOutreachSystemMessage(
  client: DbClient,
  input: InsertProductOutreachSystemMessageInput,
): Promise<InsertProductOutreachSystemMessageResult> {
  const now = new Date().toISOString();
  const row: SystemMessageInsert = {
    message_type: SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH,
    origin: SYSTEM_MESSAGE_ORIGIN_MANUAL_PRODUCT_EMAIL,
    status: 'sent',
    catalog_item_id: input.catalogItemId,
    resend_email_id: input.resendEmailId,
    to_email: normalizeSystemMessageEmail(input.toEmail),
    to_name: input.toName?.trim() || null,
    subject: input.subject,
    prospect_id: input.prospectId ?? null,
    account_contact_id: input.accountContactId ?? null,
    sent_by: input.sentBy,
    queued_at: now,
    sent_at: now,
    payload: {
      sku: input.payload.sku,
      name: input.payload.name,
      slug: input.payload.slug,
      productHref: input.payload.productHref,
      ...(input.payload.from ? { from: input.payload.from } : {}),
    },
  };

  const { data, error } = await client.from('system_messages').insert(row).select('id').single();

  if (error || !data?.id) {
    return { ok: false, error: error?.message ?? 'Failed to insert system message' };
  }

  return { ok: true, id: data.id };
}

function mapHistoryRow(row: {
  id: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  status: string;
  sent_at: string | null;
  prospect_id: number | null;
  account_contact_id: string | null;
  created_at: string;
  open_count: number;
  click_count: number;
  opened_at: string | null;
  clicked_at: string | null;
  delivered_at: string | null;
  bounced_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
}): ProductOutreachHistoryItem {
  return {
    id: row.id,
    toEmail: row.to_email,
    toName: row.to_name,
    subject: row.subject,
    status: row.status,
    sentAt: row.sent_at,
    prospectId: row.prospect_id,
    accountContactId: row.account_contact_id,
    prospectName: null,
    contactName: null,
    createdAt: row.created_at,
    openCount: row.open_count,
    clickCount: row.click_count,
    openedAt: row.opened_at,
    clickedAt: row.clicked_at,
    deliveredAt: row.delivered_at,
    bouncedAt: row.bounced_at,
    failedAt: row.failed_at,
    failureReason: row.failure_reason,
  };
}

/**
 * Staff browser fetch of product_outreach System Messages for a catalog item.
 * RLS restricts to approved staff. Does not include Copy Email Card activity.
 */
export async function fetchProductOutreachHistory(
  catalogItemId: string,
): Promise<{ data: ProductOutreachHistoryItem[]; error: string | null }> {
  const trimmedId = catalogItemId.trim();
  if (!trimmedId) {
    return { data: [], error: 'A catalog item id is required' };
  }

  const { data, error } = await supabase
    .from('system_messages')
    .select(PRODUCT_OUTREACH_HISTORY_SELECT)
    .eq('message_type', SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH)
    .eq('catalog_item_id', trimmedId)
    .order('sent_at', { ascending: false, nullsFirst: false })
    .limit(PRODUCT_OUTREACH_HISTORY_LIMIT);

  if (error) {
    return { data: [], error: error.message };
  }

  const rows = (data ?? []).map(mapHistoryRow);
  if (rows.length === 0) {
    return { data: [], error: null };
  }

  const prospectIds = [
    ...new Set(
      rows
        .map((r) => r.prospectId)
        .filter((id): id is number => typeof id === 'number' && Number.isFinite(id)),
    ),
  ];
  const contactIds = [
    ...new Set(
      rows
        .map((r) => r.accountContactId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];

  const [prospectsResult, contactsResult] = await Promise.all([
    prospectIds.length
      ? supabase.from('prospects').select('id, name').in('id', prospectIds)
      : Promise.resolve({ data: [] as Array<{ id: number; name: string }>, error: null }),
    contactIds.length
      ? supabase.from('account_contacts').select('id, full_name').in('id', contactIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; full_name: string }>,
          error: null,
        }),
  ]);

  if (prospectsResult.error) {
    return { data: [], error: prospectsResult.error.message };
  }
  if (contactsResult.error) {
    return { data: [], error: contactsResult.error.message };
  }

  const prospectNameById = new Map<number, string>();
  for (const p of prospectsResult.data ?? []) {
    prospectNameById.set(p.id, p.name);
  }
  const contactNameById = new Map<string, string>();
  for (const c of contactsResult.data ?? []) {
    contactNameById.set(c.id, c.full_name);
  }

  return {
    data: rows.map((row) => ({
      ...row,
      prospectName: row.prospectId != null ? (prospectNameById.get(row.prospectId) ?? null) : null,
      contactName:
        row.accountContactId != null ? (contactNameById.get(row.accountContactId) ?? null) : null,
    })),
    error: null,
  };
}

export type ProductEngagementAlertKind = 'opened' | 'clicked';

export type ProductEngagementMessageRow = {
  catalog_item_id: string | null;
  last_opened_at: string | null;
  last_clicked_at: string | null;
  last_engagement_received_at: string | null;
};

/**
 * Derive per-product Line Sheet alert kinds.
 * Unseen when system receipt time is after the product seen cursor.
 * Badge kind uses provider occurrence timestamps; clicks win when both exist.
 */
export function deriveProductEngagementAlerts(
  messages: ProductEngagementMessageRow[],
  seenByCatalogItemId: Record<string, string | null | undefined>,
): Record<string, ProductEngagementAlertKind> {
  const result: Record<string, ProductEngagementAlertKind> = {};

  for (const msg of messages) {
    const catalogItemId = msg.catalog_item_id?.trim();
    if (!catalogItemId) continue;

    const seenRaw = seenByCatalogItemId[catalogItemId];
    const seenMs =
      typeof seenRaw === 'string' && seenRaw.length > 0
        ? Date.parse(seenRaw)
        : Number.NEGATIVE_INFINITY;
    const receiptMs = msg.last_engagement_received_at
      ? Date.parse(msg.last_engagement_received_at)
      : Number.NEGATIVE_INFINITY;

    if (!(Number.isFinite(receiptMs) && receiptMs > seenMs)) continue;

    const clickMs = msg.last_clicked_at
      ? Date.parse(msg.last_clicked_at)
      : Number.NEGATIVE_INFINITY;
    const openMs = msg.last_opened_at ? Date.parse(msg.last_opened_at) : Number.NEGATIVE_INFINITY;
    const kind: ProductEngagementAlertKind =
      Number.isFinite(clickMs) && (!Number.isFinite(openMs) || clickMs >= openMs)
        ? 'clicked'
        : 'opened';

    if (kind === 'clicked') {
      result[catalogItemId] = 'clicked';
    } else if (result[catalogItemId] !== 'clicked') {
      result[catalogItemId] = 'opened';
    }
  }

  return result;
}

/**
 * Staff browser fetch of unseen Product Email engagement alerts for the Line Sheet.
 */
export async function fetchProductEngagementAlerts(): Promise<{
  data: Record<string, ProductEngagementAlertKind>;
  error: string | null;
}> {
  const [messagesResult, seenResult] = await Promise.all([
    supabase
      .from('system_messages')
      .select('catalog_item_id, last_opened_at, last_clicked_at, last_engagement_received_at')
      .eq('message_type', SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH)
      .not('catalog_item_id', 'is', null)
      .not('last_engagement_received_at', 'is', null),
    supabase.from('product_outreach_engagement_seen').select('catalog_item_id, seen_at'),
  ]);

  if (messagesResult.error) {
    return { data: {}, error: messagesResult.error.message };
  }
  if (seenResult.error) {
    return { data: {}, error: seenResult.error.message };
  }

  const seenByCatalogItemId: Record<string, string> = {};
  for (const row of seenResult.data ?? []) {
    seenByCatalogItemId[row.catalog_item_id] = row.seen_at;
  }

  return {
    data: deriveProductEngagementAlerts(messagesResult.data ?? [], seenByCatalogItemId),
    error: null,
  };
}

/**
 * Mark product outreach engagement as seen for a catalog item (Product Drawer open).
 * Does not modify open_count / click_count or message history rows.
 */
export async function markProductEngagementSeen(
  catalogItemId: string,
): Promise<{ error: string | null }> {
  const trimmedId = catalogItemId.trim();
  if (!trimmedId) {
    return { error: 'A catalog item id is required' };
  }

  const { error } = await supabase.from('product_outreach_engagement_seen').upsert(
    {
      catalog_item_id: trimmedId,
      seen_at: new Date().toISOString(),
    },
    { onConflict: 'catalog_item_id' },
  );

  return { error: error?.message ?? null };
}
