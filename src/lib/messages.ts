import { supabase } from '@/lib/supabase';
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
  'id, prospect_id, mapping_status, identity_fingerprint, confirmed_fingerprint, source, subject, last_message_at, created_at, updated_at' as const;

export const MESSAGE_SELECT =
  'id, thread_id, kind, wholesale_order_request_id, body, payload, created_at' as const;

export type MessageThread = {
  id: string;
  prospectId: number | null;
  mappingStatus: MappingStatus;
  identityFingerprint: string;
  confirmedFingerprint: string | null;
  source: string;
  subject: string;
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

function asMappingStatus(value: string): MappingStatus {
  if (value === 'suggested' || value === 'confirmed' || value === 'unmapped') return value;
  return 'unmapped';
}

function mapThreadRow(row: {
  id: string;
  prospect_id: number | null;
  mapping_status: string;
  identity_fingerprint: string;
  confirmed_fingerprint: string | null;
  source: string;
  subject: string;
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

export async function fetchNeedsMappingCount(): Promise<{ count: number; error: string | null }> {
  const { count, error } = await supabase
    .from('message_threads')
    .select('id', { count: 'exact', head: true })
    .neq('mapping_status', 'confirmed');

  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}

export async function fetchMessageThreads(
  options: {
    filter?: MessageThreadFilter;
    prospectId?: number;
    limit?: number;
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

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };

  const threads = (data ?? []).map(mapThreadRow);
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
      return {
        ...t,
        businessName: payload.businessName ?? null,
        buyerName: payload.buyerName ?? null,
        email: payload.email ?? null,
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
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from('message_threads')
    .update({
      prospect_id: args.prospectId,
      mapping_status: 'confirmed',
      confirmed_fingerprint: args.confirmedFingerprint,
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
