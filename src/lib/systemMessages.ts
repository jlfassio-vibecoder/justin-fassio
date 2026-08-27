import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { normalizePublicMarket, type PublicMarket } from '@/lib/pricingMarket';
import type { Database, SystemMessageInsert, SystemMessageUpdate } from '@/types/database';

type DbClient = SupabaseClient<Database>;

export const SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH = 'product_outreach' as const;
export const SYSTEM_MESSAGE_ORIGIN_MANUAL_PRODUCT_EMAIL = 'manual_product_email' as const;
export const SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL = 'agent_product_email' as const;

export const PRODUCT_OUTREACH_HISTORY_SELECT =
  'id, to_email, to_name, subject, status, origin, intro_text, closing_text, sent_at, prospect_id, account_contact_id, catalog_item_id, created_at, open_count, click_count, opened_at, clicked_at, last_opened_at, last_clicked_at, delivered_at, bounced_at, failed_at, failure_reason' as const;

export const PRODUCT_OUTREACH_HISTORY_LIMIT = 50;

export const AGENT_PRODUCT_OUTREACH_DRAFT_SELECT =
  'id, message_type, origin, status, catalog_item_id, resend_email_id, to_email, to_name, subject, intro_text, closing_text, prospect_id, retailer_line_account_id, account_contact_id, sent_by, queued_at, sent_at, payload, automation_run_id, created_at, updated_at' as const;

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
  lastOpenedAt: string | null;
  lastClickedAt: string | null;
  deliveredAt: string | null;
  bouncedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
};

export type ProductOutreachCrmAssociation = {
  prospectId: number | null;
  accountContactId: string | null;
};

export type ProductOutreachGenerationMeta = {
  promptVersion: string;
  model: string;
  preparationDate: string;
  selectionReasons: {
    priority: string | null;
    fitScore: number | null;
    channelMatch: boolean;
    productFit: 'channel_intersect' | 'global_fallback';
    exclusionsChecked: true;
  };
  /** Phase 4: channel snapshot for attribution / learning. */
  primaryChannel?: string | null;
  /** Frozen at prep for Add copy parity. */
  secondaryChannels?: string[];
  /** Frozen product sales-rank hint for Add copy parity. */
  productSalesRank?: number | null;
  fallback: 'none' | 'defaults' | 'retry_shorten';
  introWordCount: number;
  closingWordCount: number;
  generatedAt: string;
  /** Prep stubs use `stub`; staff Add copy uses `ai`. Older drafts omit this. */
  copyStatus?: 'stub' | 'ai';
  /** Slice B: which allowlisted research/profile fields were present for AI copy. */
  contextFlags?: {
    hasWebsiteHost: boolean;
    acceptedNoteCount: number;
    lockedSourceCount: number;
    hasContactRole: boolean;
    hasBriefBullets: boolean;
    hasDirectorySignals: boolean;
  };
};

export type ProductOutreachSystemMessagePayload = {
  sku: string;
  name: string;
  slug: string;
  productHref: string;
  from?: string;
  /** Explicit public market for accountless drafts. Canadian drafts omit this. */
  publicMarket?: PublicMarket;
  /** Phase 2 generation audit — preserved across approve-and-send. */
  generation?: ProductOutreachGenerationMeta;
};

export function publicMarketFromOutreachPayload(payload: unknown): PublicMarket | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const value = (payload as { publicMarket?: unknown }).publicMarket;
  return typeof value === 'string' ? normalizePublicMarket(value) : null;
}

/** Build lean payload for insert/update/send, optionally preserving generation meta. */
export function buildProductOutreachPayload(
  base: Pick<ProductOutreachSystemMessagePayload, 'sku' | 'name' | 'slug' | 'productHref'> & {
    from?: string;
    publicMarket?: PublicMarket;
  },
  generation?: ProductOutreachGenerationMeta | null,
): ProductOutreachSystemMessagePayload {
  return {
    sku: base.sku,
    name: base.name,
    slug: base.slug,
    productHref: base.productHref,
    ...(base.from ? { from: base.from } : {}),
    ...(base.publicMarket === 'us' ? { publicMarket: 'us' as const } : {}),
    ...(generation ? { generation } : {}),
  };
}

export function parseGenerationMeta(raw: unknown): ProductOutreachGenerationMeta | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const g = raw as Record<string, unknown>;
  if (typeof g.promptVersion !== 'string' || typeof g.model !== 'string') return undefined;
  if (typeof g.preparationDate !== 'string' || typeof g.generatedAt !== 'string') return undefined;
  if (typeof g.introWordCount !== 'number' || typeof g.closingWordCount !== 'number') {
    return undefined;
  }
  if (g.fallback !== 'none' && g.fallback !== 'defaults' && g.fallback !== 'retry_shorten') {
    return undefined;
  }
  const reasons = g.selectionReasons;
  if (!reasons || typeof reasons !== 'object' || Array.isArray(reasons)) return undefined;
  const r = reasons as Record<string, unknown>;
  if (r.exclusionsChecked !== true) return undefined;
  if (typeof r.channelMatch !== 'boolean') return undefined;
  if (r.productFit !== 'channel_intersect' && r.productFit !== 'global_fallback') return undefined;

  return {
    promptVersion: g.promptVersion,
    model: g.model,
    preparationDate: g.preparationDate,
    selectionReasons: {
      priority: typeof r.priority === 'string' ? r.priority : null,
      fitScore: typeof r.fitScore === 'number' ? r.fitScore : null,
      channelMatch: r.channelMatch,
      productFit: r.productFit,
      exclusionsChecked: true,
    },
    ...(typeof g.primaryChannel === 'string' || g.primaryChannel === null
      ? { primaryChannel: g.primaryChannel }
      : {}),
    ...(Array.isArray(g.secondaryChannels)
      ? {
          secondaryChannels: g.secondaryChannels.filter(
            (c): c is string => typeof c === 'string' && c.trim().length > 0,
          ),
        }
      : {}),
    ...(typeof g.productSalesRank === 'number' &&
    Number.isFinite(g.productSalesRank) &&
    g.productSalesRank > 0
      ? { productSalesRank: g.productSalesRank }
      : g.productSalesRank === null
        ? { productSalesRank: null }
        : {}),
    fallback: g.fallback,
    introWordCount: g.introWordCount,
    closingWordCount: g.closingWordCount,
    generatedAt: g.generatedAt,
    ...(g.copyStatus === 'stub' || g.copyStatus === 'ai' ? { copyStatus: g.copyStatus } : {}),
    ...(g.contextFlags && typeof g.contextFlags === 'object' && !Array.isArray(g.contextFlags)
      ? (() => {
          const f = g.contextFlags as Record<string, unknown>;
          if (
            typeof f.hasWebsiteHost !== 'boolean' ||
            typeof f.acceptedNoteCount !== 'number' ||
            typeof f.lockedSourceCount !== 'number' ||
            typeof f.hasContactRole !== 'boolean' ||
            typeof f.hasBriefBullets !== 'boolean' ||
            typeof f.hasDirectorySignals !== 'boolean'
          ) {
            return {};
          }
          return {
            contextFlags: {
              hasWebsiteHost: f.hasWebsiteHost,
              acceptedNoteCount: f.acceptedNoteCount,
              lockedSourceCount: f.lockedSourceCount,
              hasContactRole: f.hasContactRole,
              hasBriefBullets: f.hasBriefBullets,
              hasDirectorySignals: f.hasDirectorySignals,
            },
          };
        })()
      : {}),
  };
}

export type InsertProductOutreachSystemMessageInput = {
  catalogItemId: string;
  resendEmailId: string;
  toEmail: string;
  toName?: string | null;
  subject: string;
  prospectId?: number | null;
  accountContactId?: string | null;
  retailerLineAccountId?: string | null;
  sentBy: string;
  payload: ProductOutreachSystemMessagePayload;
};

/** Pre-send ledger row (status=sending) before Resend returns an email id. */
export type InsertProductOutreachSendingMessageInput = {
  catalogItemId: string;
  toEmail: string;
  toName?: string | null;
  subject: string;
  prospectId?: number | null;
  accountContactId?: string | null;
  retailerLineAccountId?: string | null;
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
 * Explicit prospectId + accountContactId win over email match.
 * Prospect without contact stays on that account (no email rematch).
 * Contact without prospect is rejected. Neither id → unique email match.
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

  if (hasContact && !hasProspect) {
    return {
      ok: false,
      error: 'prospectId is required when accountContactId is provided',
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

  if (hasProspect) {
    return {
      ok: true,
      association: {
        prospectId: input.prospectId as number,
        accountContactId: null,
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

export type ValidateProductOutreachRetailerLineAccountResult =
  { ok: true; retailerLineAccountId: string } | { ok: false; error: string };

/**
 * Load an operational (non-terminated) RLA and confirm it belongs to the prospect
 * (and sales line, when that id is sent).
 */
export async function validateProductOutreachRetailerLineAccount(
  client: DbClient,
  input: {
    retailerLineAccountId: string;
    prospectId: number;
    salesLineId?: string | null;
  },
): Promise<ValidateProductOutreachRetailerLineAccountResult> {
  const { data, error } = await client
    .from('retailer_line_accounts')
    .select('id, retailer_id, sales_line_id, relationship_status')
    .eq('id', input.retailerLineAccountId)
    .neq('relationship_status', 'terminated')
    .maybeSingle();

  if (error) {
    return { ok: false, error: 'Could not validate retailer line account' };
  }
  if (!data) {
    return { ok: false, error: 'Retailer line account not found' };
  }
  if (data.retailer_id !== input.prospectId) {
    return { ok: false, error: 'Retailer line account does not belong to the given prospect' };
  }
  const salesLineId = input.salesLineId?.trim();
  if (salesLineId && data.sales_line_id !== salesLineId) {
    return { ok: false, error: 'Retailer line account does not belong to the given sales line' };
  }

  return { ok: true, retailerLineAccountId: data.id };
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
  retailerLineAccountId: string | null;
  accountContactId: string;
  sentBy: string | null;
  queuedAt: string | null;
  sentAt: string | null;
  payload: ProductOutreachSystemMessagePayload;
  automationRunId: string | null;
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
  retailerLineAccountId?: string | null;
  accountContactId: string;
  /** Null allowed for cron when OUTREACH_PREP_ACTOR_USER_ID is unset. */
  sentBy: string | null;
  payload: ProductOutreachSystemMessagePayload;
  automationRunId?: string | null;
};

export type UpdateAgentProductOutreachDraftInput = {
  toEmail?: string;
  toName?: string;
  subject?: string;
  introText?: string;
  closingText?: string;
  /** When regenerating for a new product selection. */
  catalogItemId?: string;
  retailerLineAccountId?: string | null;
  payload?: ProductOutreachSystemMessagePayload;
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
  retailer_line_account_id: string | null;
  account_contact_id: string | null;
  sent_by: string | null;
  queued_at: string | null;
  sent_at: string | null;
  payload: unknown;
  automation_run_id?: string | null;
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
  const payloadMarket = publicMarketFromOutreachPayload(payload);

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
    retailerLineAccountId: row.retailer_line_account_id,
    accountContactId: row.account_contact_id,
    sentBy: row.sent_by,
    queuedAt: row.queued_at,
    sentAt: row.sent_at,
    payload: buildProductOutreachPayload(
      {
        sku: typeof payload.sku === 'string' ? payload.sku : '',
        name: typeof payload.name === 'string' ? payload.name : '',
        slug: typeof payload.slug === 'string' ? payload.slug : '',
        productHref: typeof payload.productHref === 'string' ? payload.productHref : '',
        ...(typeof payload.from === 'string' ? { from: payload.from } : {}),
        ...(payloadMarket ? { publicMarket: payloadMarket } : {}),
      },
      parseGenerationMeta(payload.generation),
    ),
    automationRunId: row.automation_run_id ?? null,
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
    retailer_line_account_id: input.retailerLineAccountId ?? null,
    account_contact_id: input.accountContactId,
    sent_by: input.sentBy,
    queued_at: null,
    sent_at: null,
    payload: buildProductOutreachPayload(input.payload, input.payload.generation ?? null),
    ...(input.automationRunId ? { automation_run_id: input.automationRunId } : {}),
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
    retailerLineAccountId?: string;
    /** Single status filter (default `draft` when `statuses` omitted). */
    status?: string;
    /** When set, overrides `status` and filters with `.in()`. */
    statuses?: string[];
    /** Prep scope: filter by automation run and/or preparationDate in payload. */
    automationRunId?: string;
    preparationDate?: string;
    /** When true, catalogItemId/prospectId are optional (staff briefing / pending counts). */
    prepScope?: boolean;
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
    .order('sent_at', { ascending: false, nullsFirst: true })
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
  if (input.retailerLineAccountId?.trim()) {
    query = query.eq('retailer_line_account_id', input.retailerLineAccountId.trim());
  }
  if (input.automationRunId?.trim()) {
    query = query.eq('automation_run_id', input.automationRunId.trim());
  }

  const { data, error } = await query;
  if (error) {
    return { ok: false, error: error.message };
  }

  let drafts = (data ?? [])
    .map(mapAgentDraftRow)
    .filter((row): row is AgentProductOutreachDraftRow => row != null);

  const prepDate = input.preparationDate?.trim();
  if (prepDate) {
    drafts = drafts.filter((d) => d.payload.generation?.preparationDate === prepDate);
  }

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
 * When both filters are provided, matches either prospect_id or to_email (OR).
 * Uses prospect_sent_at / to_email indexes.
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

const RECENT_PRODUCT_OUTREACH_SELECT = 'prospect_id, catalog_item_id' as const;

/**
 * Catalog item ids recently sent to each prospect within windowDays.
 * Used by Phase 1 product dedup (excludes null catalog_item_id).
 */
export async function fetchRecentProductOutreachCatalogIdsByProspect(
  client: DbClient,
  prospectIds: number[],
  windowDays: number,
  asOf: Date = new Date(),
): Promise<{ ok: true; byProspectId: Map<number, Set<string>> } | { ok: false; error: string }> {
  const byProspectId = new Map<number, Set<string>>();
  const ids = [...new Set(prospectIds.filter((id) => Number.isFinite(id)))];
  if (ids.length === 0) {
    return { ok: true, byProspectId };
  }

  const windowMs = Math.max(0, windowDays) * 24 * 60 * 60 * 1000;
  const since = new Date(asOf.getTime() - windowMs).toISOString();

  const { data, error } = await client
    .from('system_messages')
    .select(RECENT_PRODUCT_OUTREACH_SELECT)
    .eq('message_type', SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH)
    .not('sent_at', 'is', null)
    .gte('sent_at', since)
    .in('prospect_id', ids)
    .not('catalog_item_id', 'is', null);

  if (error) {
    return { ok: false, error: error.message };
  }

  for (const row of data ?? []) {
    if (
      typeof row.prospect_id !== 'number' ||
      !Number.isFinite(row.prospect_id) ||
      typeof row.catalog_item_id !== 'string' ||
      !row.catalog_item_id.trim()
    ) {
      continue;
    }
    const set = byProspectId.get(row.prospect_id) ?? new Set<string>();
    set.add(row.catalog_item_id);
    byProspectId.set(row.prospect_id, set);
  }

  return { ok: true, byProspectId };
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

/**
 * Pending agent draft counts keyed by catalog_item_id for Line Sheet Draft badges.
 * Does not read or write product_outreach_engagement_seen.
 */
export async function fetchPendingAgentDraftCountsByCatalogItemId(): Promise<{
  data: Record<string, number>;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('system_messages')
    .select('catalog_item_id')
    .eq('message_type', SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH)
    .eq('origin', SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL)
    .in('status', ['draft', 'queued', 'scheduled'])
    .not('catalog_item_id', 'is', null);

  if (error) {
    return { data: {}, error: error.message };
  }

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = row.catalog_item_id;
    if (typeof id === 'string' && id.trim()) {
      counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  return { data: counts, error: null };
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
  if (input.catalogItemId != null) {
    patch.catalog_item_id = input.catalogItemId.trim();
  }
  if (input.retailerLineAccountId !== undefined) {
    patch.retailer_line_account_id = input.retailerLineAccountId?.trim() || null;
  }
  if (input.payload != null) {
    const generation = input.payload.generation ?? existing.draft.payload.generation ?? null;
    patch.payload = buildProductOutreachPayload(input.payload, generation);
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
  // Preserve generation metadata from the draft when send payload omits it.
  const generation = input.payload.generation ?? existing.draft.payload.generation ?? null;
  const { error } = await client
    .from('system_messages')
    .update({
      status: 'sent',
      resend_email_id: input.resendEmailId,
      queued_at: now,
      sent_at: now,
      sent_by: input.sentBy,
      payload: buildProductOutreachPayload(input.payload, generation),
    })
    .eq('id', existing.draft.id)
    .eq('status', 'draft')
    .eq('origin', SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, id: existing.draft.id };
}

/**
 * Stamp resend_email_id + sent after a successful Resend send when the draft
 * transition may have partially applied (recoverable logged:false path).
 */
export async function stampAgentProductOutreachDraftResendId(
  client: DbClient,
  id: string,
  input: MarkAgentProductOutreachDraftSentInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const existing = await getAgentProductOutreachDraftById(client, id);
  if (!existing.ok) return existing;
  if (
    existing.draft.status !== 'draft' &&
    existing.draft.status !== 'sending' &&
    !(existing.draft.status === 'sent' && !existing.draft.resendEmailId)
  ) {
    return { ok: false, error: 'Draft is not eligible for Resend id stamp' };
  }

  const now = new Date().toISOString();
  const generation = input.payload.generation ?? existing.draft.payload.generation ?? null;
  const { error } = await client
    .from('system_messages')
    .update({
      status: 'sent',
      resend_email_id: input.resendEmailId,
      queued_at: existing.draft.queuedAt ?? now,
      sent_at: existing.draft.sentAt ?? now,
      sent_by: input.sentBy,
      payload: buildProductOutreachPayload(input.payload, generation),
    })
    .eq('id', existing.draft.id)
    .eq('origin', SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL)
    .in('status', ['draft', 'sending', 'sent']);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, id: existing.draft.id };
}

const STAMP_RETRY_ATTEMPTS = 3;
const STAMP_RETRY_BASE_MS = 40;

async function sleepMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Run an ok/error stamp helper up to 3 times (2 retries) with short backoff. */
export async function stampResendEmailIdWithRetry(
  stamp: () => Promise<{ ok: true; id: string } | { ok: false; error: string }>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  let last: { ok: true; id: string } | { ok: false; error: string } = {
    ok: false,
    error: 'Stamp did not run',
  };
  for (let attempt = 0; attempt < STAMP_RETRY_ATTEMPTS; attempt++) {
    last = await stamp();
    if (last.ok) return last;
    if (attempt < STAMP_RETRY_ATTEMPTS - 1) {
      await sleepMs(STAMP_RETRY_BASE_MS * (attempt + 1));
    }
  }
  return last;
}

export async function insertProductOutreachSendingMessage(
  client: DbClient,
  input: InsertProductOutreachSendingMessageInput,
): Promise<InsertProductOutreachSystemMessageResult> {
  const now = new Date().toISOString();
  const row: SystemMessageInsert = {
    message_type: SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH,
    origin: SYSTEM_MESSAGE_ORIGIN_MANUAL_PRODUCT_EMAIL,
    status: 'sending',
    catalog_item_id: input.catalogItemId,
    resend_email_id: null,
    to_email: normalizeSystemMessageEmail(input.toEmail),
    to_name: input.toName?.trim() || null,
    subject: input.subject,
    prospect_id: input.prospectId ?? null,
    account_contact_id: input.accountContactId ?? null,
    retailer_line_account_id: input.retailerLineAccountId ?? null,
    sent_by: input.sentBy,
    queued_at: now,
    sent_at: null,
    payload: {
      sku: input.payload.sku,
      name: input.payload.name,
      slug: input.payload.slug,
      productHref: input.payload.productHref,
      ...(input.payload.from ? { from: input.payload.from } : {}),
      ...(input.payload.publicMarket === 'us' ? { publicMarket: 'us' as const } : {}),
    },
  };

  const { data, error } = await client.from('system_messages').insert(row).select('id').single();

  if (error || !data?.id) {
    return { ok: false, error: error?.message ?? 'Failed to insert system message' };
  }

  return { ok: true, id: data.id };
}

export async function stampProductOutreachMessageSent(
  client: DbClient,
  id: string,
  input: { resendEmailId: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { error } = await client
    .from('system_messages')
    .update({
      status: 'sent',
      resend_email_id: input.resendEmailId,
      sent_at: now,
    })
    .eq('id', id)
    .eq('origin', SYSTEM_MESSAGE_ORIGIN_MANUAL_PRODUCT_EMAIL)
    .in('status', ['sending', 'sent']);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, id };
}

export async function markProductOutreachMessageFailed(
  client: DbClient,
  id: string,
  failureReason: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { error } = await client
    .from('system_messages')
    .update({
      status: 'failed',
      failed_at: now,
      failure_reason: failureReason.slice(0, 500),
    })
    .eq('id', id)
    .eq('origin', SYSTEM_MESSAGE_ORIGIN_MANUAL_PRODUCT_EMAIL)
    .eq('status', 'sending');

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, id };
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
    retailer_line_account_id: input.retailerLineAccountId ?? null,
    sent_by: input.sentBy,
    queued_at: now,
    sent_at: now,
    payload: {
      sku: input.payload.sku,
      name: input.payload.name,
      slug: input.payload.slug,
      productHref: input.payload.productHref,
      ...(input.payload.from ? { from: input.payload.from } : {}),
      ...(input.payload.publicMarket === 'us' ? { publicMarket: 'us' as const } : {}),
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
  last_opened_at: string | null;
  last_clicked_at: string | null;
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
    lastOpenedAt: row.last_opened_at,
    lastClickedAt: row.last_clicked_at,
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
    .order('sent_at', { ascending: false })
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
