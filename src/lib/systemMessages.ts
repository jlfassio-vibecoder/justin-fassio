import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Database, SystemMessageInsert, SystemMessageUpdate } from '@/types/database';

type DbClient = SupabaseClient<Database>;

export const SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH = 'product_outreach' as const;
export const SYSTEM_MESSAGE_ORIGIN_MANUAL_PRODUCT_EMAIL = 'manual_product_email' as const;
export const SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL = 'agent_product_email' as const;

export const PRODUCT_OUTREACH_HISTORY_SELECT =
  'id, to_email, to_name, subject, status, origin, intro_text, closing_text, sent_at, prospect_id, account_contact_id, catalog_item_id, created_at, open_count, click_count, opened_at, clicked_at, delivered_at, bounced_at, failed_at, failure_reason' as const;

export const PRODUCT_OUTREACH_HISTORY_LIMIT = 50;

export const AGENT_PRODUCT_OUTREACH_DRAFT_SELECT =
  'id, message_type, origin, status, catalog_item_id, resend_email_id, to_email, to_name, subject, intro_text, closing_text, prospect_id, account_contact_id, sent_by, queued_at, sent_at, payload, created_at, updated_at' as const;

export type ProductOutreachHistoryItem = {
  id: string;
  toEmail: string;
  toName: string | null;
  subject: string;
  status: string;
  origin: string;
  introText: string | null;
  closingText: string | null;
  sentAt: string | null;
  prospectId: number | null;
  accountContactId: string | null;
  catalogItemId: string | null;
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

/**
 * Require an explicit prospect + contact pair that belongs together.
 * Used for agent drafts — never soft-matches by email.
 */
export async function requireExplicitProductOutreachCrmAssociation(
  client: DbClient,
  input: {
    prospectId: number;
    accountContactId: string;
  },
): Promise<
  | { ok: true; association: { prospectId: number; accountContactId: string } }
  | { ok: false; error: string }
> {
  const result = await resolveProductOutreachCrmAssociation(client, {
    prospectId: input.prospectId,
    accountContactId: input.accountContactId,
    toEmail: '',
  });
  if (!result.ok) return result;
  if (result.association.prospectId == null || result.association.accountContactId == null) {
    return { ok: false, error: 'prospectId and accountContactId are required' };
  }
  return {
    ok: true,
    association: {
      prospectId: result.association.prospectId,
      accountContactId: result.association.accountContactId,
    },
  };
}

export type InsertProductOutreachSystemMessageResult =
  { ok: true; id: string } | { ok: false; error: string };

export type AgentProductOutreachDraftRow = {
  id: string;
  messageType: string;
  origin: string;
  status: string;
  catalogItemId: string;
  resendEmailId: string | null;
  toEmail: string;
  toName: string;
  subject: string;
  introText: string;
  closingText: string;
  prospectId: number;
  accountContactId: string;
  sentBy: string | null;
  queuedAt: string | null;
  sentAt: string | null;
  payload: ProductOutreachSystemMessagePayload;
  createdAt: string;
  updatedAt: string;
};

export type InsertAgentProductOutreachDraftInput = {
  catalogItemId: string;
  toEmail: string;
  toName: string;
  subject: string;
  introText: string;
  closingText: string;
  prospectId: number;
  accountContactId: string;
  sentBy: string;
  payload: ProductOutreachSystemMessagePayload;
};

export type UpdateAgentProductOutreachDraftInput = {
  toEmail?: string;
  toName?: string;
  subject?: string;
  introText?: string;
  closingText?: string;
};

export type MarkAgentProductOutreachDraftSentInput = {
  resendEmailId: string;
  sentBy: string;
  payload: ProductOutreachSystemMessagePayload;
};

function mapAgentDraftRow(row: {
  id: string;
  message_type: string;
  origin: string;
  status: string;
  catalog_item_id: string | null;
  resend_email_id: string | null;
  to_email: string;
  to_name: string | null;
  subject: string;
  intro_text: string | null;
  closing_text: string | null;
  prospect_id: number | null;
  account_contact_id: string | null;
  sent_by: string | null;
  queued_at: string | null;
  sent_at: string | null;
  payload: unknown;
  created_at: string;
  updated_at: string;
}): AgentProductOutreachDraftRow | null {
  if (
    !row.catalog_item_id ||
    row.prospect_id == null ||
    !row.account_contact_id ||
    !row.to_name?.trim() ||
    row.intro_text == null ||
    row.closing_text == null
  ) {
    return null;
  }

  const payload =
    row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {};

  return {
    id: row.id,
    messageType: row.message_type,
    origin: row.origin,
    status: row.status,
    catalogItemId: row.catalog_item_id,
    resendEmailId: row.resend_email_id,
    toEmail: row.to_email,
    toName: row.to_name.trim(),
    subject: row.subject,
    introText: row.intro_text,
    closingText: row.closing_text,
    prospectId: row.prospect_id,
    accountContactId: row.account_contact_id,
    sentBy: row.sent_by,
    queuedAt: row.queued_at,
    sentAt: row.sent_at,
    payload: {
      sku: typeof payload.sku === 'string' ? payload.sku : '',
      name: typeof payload.name === 'string' ? payload.name : '',
      slug: typeof payload.slug === 'string' ? payload.slug : '',
      productHref: typeof payload.productHref === 'string' ? payload.productHref : '',
      ...(typeof payload.from === 'string' ? { from: payload.from } : {}),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertAgentProductOutreachDraft(
  client: DbClient,
  input: InsertAgentProductOutreachDraftInput,
): Promise<InsertProductOutreachSystemMessageResult> {
  const toName = input.toName.trim();
  if (!toName) {
    return { ok: false, error: 'toName is required' };
  }

  const row: SystemMessageInsert = {
    message_type: SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH,
    origin: SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL,
    status: 'draft',
    catalog_item_id: input.catalogItemId,
    resend_email_id: null,
    to_email: normalizeSystemMessageEmail(input.toEmail),
    to_name: toName,
    subject: input.subject,
    intro_text: input.introText,
    closing_text: input.closingText,
    prospect_id: input.prospectId,
    account_contact_id: input.accountContactId,
    sent_by: input.sentBy,
    queued_at: null,
    sent_at: null,
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
    return { ok: false, error: error?.message ?? 'Failed to insert agent draft' };
  }

  return { ok: true, id: data.id };
}

export async function getAgentProductOutreachDraftById(
  client: DbClient,
  id: string,
): Promise<{ ok: true; draft: AgentProductOutreachDraftRow } | { ok: false; error: string }> {
  const trimmed = id.trim();
  if (!trimmed) {
    return { ok: false, error: 'Draft id is required' };
  }

  const { data, error } = await client
    .from('system_messages')
    .select(AGENT_PRODUCT_OUTREACH_DRAFT_SELECT)
    .eq('id', trimmed)
    .eq('message_type', SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH)
    .eq('origin', SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: 'Draft not found' };
  }

  const draft = mapAgentDraftRow(data);
  if (!draft) {
    return { ok: false, error: 'Draft is missing required fields' };
  }

  return { ok: true, draft };
}

export async function listAgentProductOutreachDrafts(
  client: DbClient,
  input: {
    catalogItemId?: string;
    prospectId?: number;
    /** Single status filter (default `draft` when `statuses` omitted). */
    status?: string;
    /** When set, overrides `status` and filters with `.in()`. */
    statuses?: string[];
    limit?: number;
  } = {},
): Promise<{ ok: true; drafts: AgentProductOutreachDraftRow[] } | { ok: false; error: string }> {
  const limit = Math.min(Math.max(input.limit ?? PRODUCT_OUTREACH_HISTORY_LIMIT, 1), 100);
  const statuses = input.statuses?.map((s) => s.trim()).filter((s) => s.length > 0) ?? null;
  const status = (input.status ?? 'draft').trim() || 'draft';

  let query = client
    .from('system_messages')
    .select(AGENT_PRODUCT_OUTREACH_DRAFT_SELECT)
    .eq('message_type', SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH)
    .eq('origin', SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (statuses && statuses.length > 0) {
    query = query.in('status', statuses);
  } else {
    query = query.eq('status', status);
  }

  if (input.catalogItemId?.trim()) {
    query = query.eq('catalog_item_id', input.catalogItemId.trim());
  }
  if (input.prospectId != null) {
    query = query.eq('prospect_id', input.prospectId);
  }

  const { data, error } = await query;
  if (error) {
    return { ok: false, error: error.message };
  }

  const drafts = (data ?? [])
    .map(mapAgentDraftRow)
    .filter((row): row is AgentProductOutreachDraftRow => row != null);

  return { ok: true, drafts };
}

const PRODUCT_OUTREACH_SEND_SELECT = 'id, prospect_id, to_email, sent_at' as const;

export type LatestProductOutreachSend = {
  id: string;
  prospectId: number | null;
  toEmail: string;
  sentAt: string;
};

/**
 * Latest product_outreach row with non-null sent_at for prospect and/or normalized to_email.
 * When both filters are provided, matches either origin (OR). Uses prospect_sent_at / to_email indexes.
 */
export async function fetchLatestProductOutreachSend(
  client: DbClient,
  input: { prospectId?: number; toEmail?: string },
): Promise<{ ok: true; row: LatestProductOutreachSend | null } | { ok: false; error: string }> {
  const prospectId = input.prospectId;
  const toEmail =
    typeof input.toEmail === 'string' && input.toEmail.trim()
      ? normalizeSystemMessageEmail(input.toEmail)
      : null;

  if (prospectId == null && !toEmail) {
    return { ok: false, error: 'prospectId or toEmail is required' };
  }

  let query = client
    .from('system_messages')
    .select(PRODUCT_OUTREACH_SEND_SELECT)
    .eq('message_type', SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH)
    .not('sent_at', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(1);

  if (prospectId != null && toEmail) {
    query = query.or(`prospect_id.eq.${prospectId},to_email.eq.${toEmail}`);
  } else if (prospectId != null) {
    query = query.eq('prospect_id', prospectId);
  } else if (toEmail) {
    query = query.eq('to_email', toEmail);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data || !data.sent_at) {
    return { ok: true, row: null };
  }

  return {
    ok: true,
    row: {
      id: data.id,
      prospectId: data.prospect_id,
      toEmail: data.to_email,
      sentAt: data.sent_at,
    },
  };
}

const PRODUCT_OUTREACH_SUPPRESSION_SELECT =
  'id, prospect_id, to_email, status, bounced_at, complained_at' as const;

/**
 * True when any historical product_outreach row for this email (or optional prospect)
 * has bounce/complaint timestamps or status in bounced|complained. Permanent until cleared at source.
 */
export async function isProductOutreachRecipientSuppressed(
  client: DbClient,
  input: { toEmail: string; prospectId?: number },
): Promise<{ ok: true; suppressed: boolean } | { ok: false; error: string }> {
  const toEmail = normalizeSystemMessageEmail(input.toEmail);
  if (!toEmail) {
    return { ok: false, error: 'toEmail is required' };
  }

  let query = client
    .from('system_messages')
    .select(PRODUCT_OUTREACH_SUPPRESSION_SELECT)
    .eq('message_type', SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH)
    .or(
      [
        'bounced_at.not.is.null',
        'complained_at.not.is.null',
        'status.eq.bounced',
        'status.eq.complained',
      ].join(','),
    )
    .limit(1);

  if (input.prospectId != null) {
    query = query.or(`to_email.eq.${toEmail},prospect_id.eq.${input.prospectId}`);
  } else {
    query = query.eq('to_email', toEmail);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, suppressed: data != null };
}

/**
 * Prospect ids that already have a non-terminal agent product_outreach draft.
 * Used by Phase 1 selection to exclude pending work without N+1 draft fetches.
 */
export async function fetchPendingAgentProductOutreachProspectIds(
  client: DbClient,
  statuses: readonly string[] = ['draft', 'queued', 'scheduled'],
): Promise<{ ok: true; prospectIds: Set<number> } | { ok: false; error: string }> {
  const statusList = statuses.map((s) => s.trim()).filter((s) => s.length > 0);
  if (statusList.length === 0) {
    return { ok: true, prospectIds: new Set() };
  }

  const { data, error } = await client
    .from('system_messages')
    .select('prospect_id')
    .eq('message_type', SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH)
    .eq('origin', SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL)
    .in('status', statusList)
    .not('prospect_id', 'is', null);

  if (error) {
    return { ok: false, error: error.message };
  }

  const prospectIds = new Set<number>();
  for (const row of data ?? []) {
    if (typeof row.prospect_id === 'number' && Number.isFinite(row.prospect_id)) {
      prospectIds.add(row.prospect_id);
    }
  }
  return { ok: true, prospectIds };
}

export async function updateAgentProductOutreachDraft(
  client: DbClient,
  id: string,
  input: UpdateAgentProductOutreachDraftInput,
): Promise<{ ok: true; draft: AgentProductOutreachDraftRow } | { ok: false; error: string }> {
  const existing = await getAgentProductOutreachDraftById(client, id);
  if (!existing.ok) return existing;
  if (existing.draft.status !== 'draft') {
    return { ok: false, error: 'Only draft messages can be updated' };
  }

  const patch: SystemMessageUpdate = {};
  if (input.toEmail != null) {
    patch.to_email = normalizeSystemMessageEmail(input.toEmail);
  }
  if (input.toName != null) {
    const toName = input.toName.trim();
    if (!toName) return { ok: false, error: 'toName is required' };
    patch.to_name = toName;
  }
  if (input.subject != null) {
    patch.subject = input.subject;
  }
  if (input.introText != null) {
    patch.intro_text = input.introText;
  }
  if (input.closingText != null) {
    patch.closing_text = input.closingText;
  }

  if (Object.keys(patch).length === 0) {
    return existing;
  }

  const { error } = await client.from('system_messages').update(patch).eq('id', existing.draft.id);
  if (error) {
    return { ok: false, error: error.message };
  }

  return getAgentProductOutreachDraftById(client, existing.draft.id);
}

export async function cancelAgentProductOutreachDraft(
  client: DbClient,
  id: string,
): Promise<{ ok: true; draft: AgentProductOutreachDraftRow } | { ok: false; error: string }> {
  const existing = await getAgentProductOutreachDraftById(client, id);
  if (!existing.ok) return existing;
  if (existing.draft.status !== 'draft') {
    return { ok: false, error: 'Only draft messages can be cancelled' };
  }

  const { error } = await client
    .from('system_messages')
    .update({ status: 'cancelled' })
    .eq('id', existing.draft.id)
    .eq('status', 'draft');

  if (error) {
    return { ok: false, error: error.message };
  }

  return getAgentProductOutreachDraftById(client, existing.draft.id);
}

export async function markAgentProductOutreachDraftSent(
  client: DbClient,
  id: string,
  input: MarkAgentProductOutreachDraftSentInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const existing = await getAgentProductOutreachDraftById(client, id);
  if (!existing.ok) return existing;
  if (existing.draft.status !== 'draft') {
    return { ok: false, error: 'Only draft messages can be sent' };
  }

  const now = new Date().toISOString();
  const { error } = await client
    .from('system_messages')
    .update({
      status: 'sent',
      resend_email_id: input.resendEmailId,
      queued_at: now,
      sent_at: now,
      sent_by: input.sentBy,
      payload: {
        sku: input.payload.sku,
        name: input.payload.name,
        slug: input.payload.slug,
        productHref: input.payload.productHref,
        ...(input.payload.from ? { from: input.payload.from } : {}),
      },
    })
    .eq('id', existing.draft.id)
    .eq('status', 'draft')
    .eq('origin', SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, id: existing.draft.id };
}

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
  origin: string;
  intro_text: string | null;
  closing_text: string | null;
  sent_at: string | null;
  prospect_id: number | null;
  account_contact_id: string | null;
  catalog_item_id: string | null;
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
    origin: row.origin,
    introText: row.intro_text,
    closingText: row.closing_text,
    sentAt: row.sent_at,
    prospectId: row.prospect_id,
    accountContactId: row.account_contact_id,
    catalogItemId: row.catalog_item_id,
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
    .order('created_at', { ascending: false })
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
    // Copilot suggestion ignored: a grouped RPC/view would add schema surface; polls already filter to engaged product-outreach rows and aggregate client-side.
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
