import { supabase } from '@/lib/supabase';
import { partitionCrmRowsForSalesLine } from '@/lib/crmLineage';
import { resolveOgrLineId, resolveWriteSalesLineId } from '@/lib/lines';
import { identityFingerprint, type MappingStatus } from '@/lib/messageFingerprint';
import { mapProspectRow, PROSPECT_SELECT, type Prospect } from '@/lib/prospects';
import type { ProspectRow } from '@/types/database';

export type { MappingStatus } from '@/lib/messageFingerprint';
export {
  identityFingerprint,
  mappingStatusAfterInbound,
  normalizeIdentityPart,
} from '@/lib/messageFingerprint';

export const MESSAGE_THREAD_SELECT =
  'id, prospect_id, retailer_line_account_id, mapping_status, identity_fingerprint, confirmed_fingerprint, source, subject, channel, chat_state, visitor_user_id, visitor_name, visitor_email, awaiting_reply_since, last_message_at, created_at, updated_at' as const;

export const MESSAGE_SELECT =
  'id, thread_id, kind, wholesale_order_request_id, body, payload, created_at' as const;

export type MessageChannel = 'wholesale' | 'live_chat';
export type ChatState = 'awaiting_human' | 'ai_active' | 'human_active';

export type MessageThread = {
  id: string;
  prospectId: number | null;
  mappingStatus: MappingStatus;
  identityFingerprint: string;
  confirmedFingerprint: string | null;
  source: string;
  subject: string;
  channel: MessageChannel;
  chatState: ChatState | null;
  visitorUserId: string | null;
  visitorName: string | null;
  visitorEmail: string | null;
  awaitingReplySince: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  /** Enriched from latest message payload when listing. */
  businessName?: string | null;
  buyerName?: string | null;
  email?: string | null;
  requestNumber?: string | null;
  prospectName?: string | null;
};

export type MessagePayloadLine = {
  sku: string;
  name: string;
  size: string | null;
  wholesaleUsd: number;
  quantity: number;
};

export type MessagePayload = {
  requestNumber?: string;
  requestType?: 'order' | 'inquiry';
  businessName?: string;
  buyerName?: string;
  email?: string;
  phone?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  retailChannel?: string;
  isExistingCustomer?: boolean;
  website?: string | null;
  gstHstNumber?: string | null;
  poNumber?: string | null;
  notes?: string | null;
  preferredContactMethod?: string | null;
  totalUnits?: number;
  merchandiseSubtotalUsd?: number;
  lines?: MessagePayloadLine[];
};

export type MessageRow = {
  id: string;
  threadId: string;
  kind: string;
  wholesaleOrderRequestId: string | null;
  body: string;
  payload: MessagePayload;
  createdAt: string;
};

export type MessageThreadFilter = 'all' | 'needs_mapping' | 'confirmed';
export type MessageChannelFilter = 'all' | 'live_chat' | 'wholesale';

function asMappingStatus(value: string): MappingStatus {
  if (value === 'suggested' || value === 'confirmed' || value === 'unmapped') return value;
  return 'unmapped';
}

function asChannel(value: string | null | undefined): MessageChannel {
  return value === 'live_chat' ? 'live_chat' : 'wholesale';
}

function asChatState(value: string | null | undefined): ChatState | null {
  if (value === 'awaiting_human' || value === 'ai_active' || value === 'human_active') return value;
  return null;
}

function mapThreadRow(row: {
  id: string;
  prospect_id: number | null;
  retailer_line_account_id?: string | null;
  mapping_status: string;
  identity_fingerprint: string;
  confirmed_fingerprint: string | null;
  source: string;
  subject: string;
  channel?: string | null;
  chat_state?: string | null;
  visitor_user_id?: string | null;
  visitor_name?: string | null;
  visitor_email?: string | null;
  awaiting_reply_since?: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}): MessageThread {
  return {
    id: row.id,
    prospectId: row.prospect_id,
    mappingStatus: asMappingStatus(row.mapping_status),
    identityFingerprint: row.identity_fingerprint,
    confirmedFingerprint: row.confirmed_fingerprint,
    source: row.source,
    subject: row.subject,
    channel: asChannel(row.channel),
    chatState: asChatState(row.chat_state),
    visitorUserId: row.visitor_user_id ?? null,
    visitorName: row.visitor_name ?? null,
    visitorEmail: row.visitor_email ?? null,
    awaitingReplySince: row.awaiting_reply_since ?? null,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessageRow(row: {
  id: string;
  thread_id: string;
  kind: string;
  wholesale_order_request_id: string | null;
  body: string;
  payload: unknown;
  created_at: string;
}): MessageRow {
  return {
    id: row.id,
    threadId: row.thread_id,
    kind: row.kind,
    wholesaleOrderRequestId: row.wholesale_order_request_id,
    body: row.body,
    payload: (row.payload ?? {}) as MessagePayload,
    createdAt: row.created_at,
  };
}

export async function fetchNeedsMappingCount(
  options: {
    salesLineId?: string | null;
  } = {},
): Promise<{ count: number; error: string | null }> {
  const salesLineId = options.salesLineId?.trim() || null;
  if (!salesLineId) {
    const { count, error } = await supabase
      .from('message_threads')
      .select('id', { count: 'exact', head: true })
      .neq('mapping_status', 'confirmed');

    if (error) return { count: 0, error: error.message };
    return { count: count ?? 0, error: null };
  }

  const listed = await fetchMessageThreads({
    filter: 'needs_mapping',
    salesLineId,
    limit: 500,
  });
  if (listed.error) return { count: 0, error: listed.error };
  return { count: listed.data.length, error: null };
}

export async function fetchMessageThreads(
  options: {
    filter?: MessageThreadFilter;
    channel?: MessageChannelFilter;
    prospectId?: number;
    limit?: number;
    salesLineId?: string | null;
  } = {},
): Promise<{ data: MessageThread[]; error: string | null }> {
  const limit = options.limit ?? 200;
  let query = supabase
    .from('message_threads')
    .select(MESSAGE_THREAD_SELECT)
    .order('last_message_at', { ascending: false })
    .limit(limit);

  if (options.prospectId != null) {
    query = query.eq('prospect_id', options.prospectId);
  }

  if (options.filter === 'needs_mapping') {
    query = query.neq('mapping_status', 'confirmed');
  } else if (options.filter === 'confirmed') {
    query = query.eq('mapping_status', 'confirmed');
  }

  if (options.channel === 'live_chat') {
    query = query.eq('channel', 'live_chat');
  } else if (options.channel === 'wholesale') {
    query = query.eq('channel', 'wholesale');
  }

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };

  const rawRows = data ?? [];
  const salesLineId = options.salesLineId?.trim() || null;
  let scopedRows = rawRows;
  if (salesLineId) {
    const rlaIds = [
      ...new Set(
        rawRows
          .map((row) => row.retailer_line_account_id)
          .filter((id): id is string => typeof id === 'string' && Boolean(id)),
      ),
    ];
    const rlaSalesLineById = new Map<string, string>();
    if (rlaIds.length > 0) {
      const { data: rlas, error: rlaError } = await supabase
        .from('retailer_line_accounts')
        .select('id, sales_line_id')
        .in('id', rlaIds);
      if (rlaError) return { data: [], error: rlaError.message };
      for (const rla of rlas ?? []) {
        rlaSalesLineById.set(rla.id, rla.sales_line_id);
      }
    }
    const ogrLineId = await resolveOgrLineId();
    const partitioned = partitionCrmRowsForSalesLine(
      rawRows.map((row) => ({
        id: row.id,
        salesLineId: null,
        retailerLineAccountId: row.retailer_line_account_id,
      })),
      rlaSalesLineById,
      salesLineId,
      ogrLineId,
    );
    const visibleIds = new Set(partitioned.visible.map((item) => item.id));
    scopedRows = rawRows.filter((row) => visibleIds.has(row.id));
  }

  const threads = scopedRows.map(mapThreadRow);
  if (threads.length === 0) return { data: [], error: null };

  const threadIds = threads.map((t) => t.id);
  const prospectIds = [
    ...new Set(
      threads
        .map((t) => t.prospectId)
        .filter((id): id is number => typeof id === 'number' && Number.isFinite(id)),
    ),
  ];

  const [latestMessagesResult, prospectsResult] = await Promise.all([
    // Copilot suggestion ignored: selecting only the latest message per thread needs a DB-side
    // DISTINCT ON view; a client-side row cap would silently drop payloads for older threads.
    supabase
      .from('messages')
      .select('thread_id, payload, created_at')
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false }),
    prospectIds.length
      ? supabase.from('prospects').select('id, name').in('id', prospectIds)
      : Promise.resolve({ data: [] as Array<{ id: number; name: string }>, error: null }),
  ]);

  if (latestMessagesResult.error) {
    return { data: [], error: latestMessagesResult.error.message };
  }
  if (prospectsResult.error) {
    return { data: [], error: prospectsResult.error.message };
  }

  const latestMessages = latestMessagesResult.data;
  const prospects = prospectsResult.data;

  const latestByThread = new Map<string, MessagePayload>();
  for (const row of latestMessages ?? []) {
    if (latestByThread.has(row.thread_id)) continue;
    latestByThread.set(row.thread_id, (row.payload ?? {}) as MessagePayload);
  }

  const prospectNameById = new Map<number, string>();
  for (const p of prospects ?? []) {
    prospectNameById.set(p.id, p.name);
  }

  return {
    data: threads.map((t) => {
      const payload = latestByThread.get(t.id) ?? {};
      const isLive = t.channel === 'live_chat';
      return {
        ...t,
        businessName: isLive
          ? (t.visitorName ?? payload.businessName ?? null)
          : (payload.businessName ?? null),
        buyerName: isLive
          ? (t.visitorName ?? payload.buyerName ?? null)
          : (payload.buyerName ?? null),
        email: isLive ? (t.visitorEmail ?? payload.email ?? null) : (payload.email ?? null),
        requestNumber: payload.requestNumber ?? null,
        prospectName: t.prospectId != null ? (prospectNameById.get(t.prospectId) ?? null) : null,
      };
    }),
    error: null,
  };
}

export async function fetchMessagesForThread(
  threadId: string,
): Promise<{ data: MessageRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map(mapMessageRow), error: null };
}

export async function fetchMessageThread(
  threadId: string,
): Promise<{ data: MessageThread | null; error: string | null }> {
  const { data, error } = await supabase
    .from('message_threads')
    .select(MESSAGE_THREAD_SELECT)
    .eq('id', threadId)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };
  return { data: mapThreadRow(data), error: null };
}

export async function confirmThreadMapping(args: {
  threadId: string;
  prospectId: number;
  confirmedFingerprint: string;
  writesEnabled?: boolean;
  salesLineId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let retailerLineAccountId: string | undefined;
  const salesLineId = await resolveWriteSalesLineId(args.salesLineId);
  if (salesLineId) {
    const { data: rla, error: rlaError } = await supabase
      .from('retailer_line_accounts')
      .select('id')
      .eq('retailer_id', args.prospectId)
      .eq('sales_line_id', salesLineId)
      .neq('relationship_status', 'terminated')
      .maybeSingle();
    if (rlaError) return { ok: false, error: rlaError.message };
    retailerLineAccountId = rla?.id;
  }

  const { error } = await supabase
    .from('message_threads')
    .update({
      prospect_id: args.prospectId,
      mapping_status: 'confirmed',
      confirmed_fingerprint: args.confirmedFingerprint,
      ...(retailerLineAccountId ? { retailer_line_account_id: retailerLineAccountId } : {}),
    })
    .eq('id', args.threadId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchProspectById(
  id: number,
): Promise<{ data: Prospect | null; error: string | null }> {
  const { data, error } = await supabase
    .from('prospects')
    .select(PROSPECT_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };
  return { data: mapProspectRow(data as ProspectRow), error: null };
}

export async function searchProspectsForMapping(
  query: string,
  limit = 12,
): Promise<{ data: Prospect[]; error: string | null }> {
  const q = query.trim();
  if (!q) return { data: [], error: null };

  const { data, error } = await supabase
    .from('prospects')
    .select(PROSPECT_SELECT)
    .or(`name.ilike.%${q}%,city.ilike.%${q}%`)
    .order('name', { ascending: true })
    .limit(limit);

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map((row) => mapProspectRow(row as ProspectRow)), error: null };
}

export function fingerprintFromPayload(payload: MessagePayload): string | null {
  if (!payload.email || !payload.businessName || !payload.buyerName) return null;
  return identityFingerprint({
    email: payload.email,
    businessName: payload.businessName,
    buyerName: payload.buyerName,
  });
}

export function fingerprintFromLiveChatThread(thread: MessageThread): string | null {
  if (!thread.visitorEmail || !thread.visitorName) return null;
  return identityFingerprint({
    email: thread.visitorEmail,
    businessName: 'live-chat',
    buyerName: thread.visitorName,
  });
}
