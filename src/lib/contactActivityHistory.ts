import { fetchPreviousCallsForLog, type PreviousCallForLog } from '@/lib/logCallForm';
import { fetchOperationalLineAccount } from '@/lib/retailerLineAccounts';
import { supabase } from '@/lib/supabase';
import {
  SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH,
  type ProductOutreachSystemMessagePayload,
} from '@/lib/systemMessages';

export const CONTACT_ACTIVITY_HISTORY_LIMIT = 25;

/** Statuses that are never a successful send (locked predicate). */
export const EXCLUDED_PRODUCT_EMAIL_SEND_STATUSES = [
  'draft',
  'queued',
  'scheduled',
  'sending',
  'cancelled',
  'failed',
] as const;

export type ContactActivityKind = 'call' | 'email';

export type ContactActivityItem = {
  kind: ContactActivityKind;
  id: string;
  /** Display date/time (call_date or sent_at). */
  occurredAt: string;
  /** ISO used for newest-first merge. */
  sortAt: string;
  contactLabel: string | null;
  outcome?: string;
  followUpDate?: string | null;
  objectionTags?: string[];
  notes?: string | null;
  subject?: string;
  productLabel?: string | null;
  senderLabel?: string | null;
  messageSummary?: string | null;
};

const ACTIVITY_EMAIL_SELECT =
  'id, to_email, to_name, subject, status, origin, intro_text, sent_at, prospect_id, account_contact_id, retailer_line_account_id, catalog_item_id, sent_by, payload, created_at' as const;

type ActivityEmailRow = {
  id: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  status: string | null;
  origin: string;
  intro_text: string | null;
  sent_at: string | null;
  prospect_id: number | null;
  account_contact_id: string | null;
  retailer_line_account_id: string | null;
  catalog_item_id: string | null;
  sent_by: string | null;
  payload: unknown;
  created_at: string;
};

/**
 * Locked successful-send predicate:
 * sent_at IS NOT NULL AND (status IS NULL OR status NOT IN excluded).
 * Avoids SQL NOT IN null behavior by treating null status as success when sent_at is set.
 */
export function isSuccessfulProductEmailSend(row: {
  sent_at: string | null | undefined;
  status: string | null | undefined;
}): boolean {
  if (row.sent_at == null || String(row.sent_at).trim() === '') return false;
  if (row.status == null || String(row.status).trim() === '') return true;
  return !(EXCLUDED_PRODUCT_EMAIL_SEND_STATUSES as readonly string[]).includes(row.status);
}

export function mapCallToActivityItem(call: PreviousCallForLog): ContactActivityItem {
  const sortAt =
    call.createdAt && call.createdAt.length > 0 ? call.createdAt : `${call.callDate}T00:00:00.000Z`;
  return {
    kind: 'call',
    id: call.id,
    occurredAt: call.callDate,
    sortAt,
    contactLabel: call.contactName,
    outcome: call.outcome,
    followUpDate: call.followUpDate,
    objectionTags: call.objectionTags,
    notes: call.notes,
  };
}

function parsePayload(raw: unknown): ProductOutreachSystemMessagePayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.sku !== 'string' || typeof p.name !== 'string') return null;
  return raw as ProductOutreachSystemMessagePayload;
}

function formatProductLabel(payload: ProductOutreachSystemMessagePayload | null): string | null {
  if (!payload) return null;
  const name = payload.name.trim();
  const sku = payload.sku.trim();
  if (name && sku) return `${name} (${sku})`;
  return name || sku || null;
}

function formatRecipient(row: ActivityEmailRow, contactName: string | null): string {
  if (contactName?.trim()) return contactName.trim();
  const name = row.to_name?.trim();
  if (name) return `${name} · ${row.to_email}`;
  return row.to_email;
}

function truncateSummary(text: string | null | undefined, max = 160): string | null {
  const t = text?.trim();
  if (!t) return null;
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function mapEmailRowToActivityItem(
  row: ActivityEmailRow,
  enrich?: { contactName?: string | null; senderLabel?: string | null },
): ContactActivityItem | null {
  if (!isSuccessfulProductEmailSend(row)) return null;
  const sentAt = row.sent_at;
  if (sentAt == null || String(sentAt).trim() === '') return null;
  const payload = parsePayload(row.payload);
  return {
    kind: 'email',
    id: row.id,
    occurredAt: sentAt,
    sortAt: sentAt,
    contactLabel: formatRecipient(row, enrich?.contactName ?? null),
    subject: row.subject,
    productLabel: formatProductLabel(payload),
    senderLabel: enrich?.senderLabel ?? null,
    messageSummary: truncateSummary(row.intro_text),
  };
}

/** Merge call + email activity, newest first, then apply final combined limit. */
export function mergeContactActivityHistory(
  calls: ContactActivityItem[],
  emails: ContactActivityItem[],
  limit: number = CONTACT_ACTIVITY_HISTORY_LIMIT,
): ContactActivityItem[] {
  return [...calls, ...emails]
    .sort((a, b) => {
      const cmp = b.sortAt.localeCompare(a.sortAt);
      if (cmp !== 0) return cmp;
      return a.id.localeCompare(b.id);
    })
    .slice(0, limit);
}

async function fetchSentProductEmailsForAccount(input: {
  prospectId: number;
  salesLineId: string | null;
  limit: number;
}): Promise<{ data: ContactActivityItem[]; error: string | null }> {
  const excluded = EXCLUDED_PRODUCT_EMAIL_SEND_STATUSES.join(',');

  let retailerLineAccountId: string | null = null;
  if (input.salesLineId) {
    const rla = await fetchOperationalLineAccount({
      retailerId: input.prospectId,
      salesLineId: input.salesLineId,
    });
    if (rla.error) return { data: [], error: rla.error };
    if (!rla.data) return { data: [], error: null };
    retailerLineAccountId = rla.data.id;
  }

  let query = supabase
    .from('system_messages')
    .select(ACTIVITY_EMAIL_SELECT)
    .eq('message_type', SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH)
    .eq('prospect_id', input.prospectId)
    .not('sent_at', 'is', null)
    // status IS NULL OR status NOT IN (...); do not use bare NOT IN alone.
    .or(`status.is.null,status.not.in.(${excluded})`);

  if (retailerLineAccountId) {
    query = query.eq('retailer_line_account_id', retailerLineAccountId);
  }

  const { data, error } = await query.order('sent_at', { ascending: false }).limit(input.limit);
  if (error) return { data: [], error: error.message };

  const rows = ((data ?? []) as ActivityEmailRow[]).filter(isSuccessfulProductEmailSend);
  if (rows.length === 0) return { data: [], error: null };

  const contactIds = [
    ...new Set(
      rows
        .map((r) => r.account_contact_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
  const senderIds = [
    ...new Set(
      rows
        .map((r) => r.sent_by)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];

  const [contactsResult, profilesResult] = await Promise.all([
    contactIds.length
      ? supabase.from('account_contacts').select('id, full_name').in('id', contactIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string }>, error: null }),
    senderIds.length
      ? supabase.from('profiles').select('id, display_name').in('id', senderIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; display_name: string | null }>,
          error: null,
        }),
  ]);

  if (contactsResult.error) return { data: [], error: contactsResult.error.message };
  if (profilesResult.error) return { data: [], error: profilesResult.error.message };

  const contactNameById = new Map<string, string>();
  for (const c of contactsResult.data ?? []) {
    contactNameById.set(c.id, c.full_name);
  }
  const senderById = new Map<string, string>();
  for (const p of profilesResult.data ?? []) {
    const label = p.display_name?.trim();
    if (label) senderById.set(p.id, label);
  }

  const items: ContactActivityItem[] = [];
  for (const row of rows) {
    const mapped = mapEmailRowToActivityItem(row, {
      contactName: row.account_contact_id
        ? (contactNameById.get(row.account_contact_id) ?? null)
        : null,
      senderLabel: row.sent_by ? (senderById.get(row.sent_by) ?? null) : null,
    });
    if (mapped) items.push(mapped);
  }

  return { data: items, error: null };
}

/**
 * Unified Call Log activity: previous calls + successful product emails for the
 * same retailer (+ sales-line RLA when salesLineId is set). Fetches up to `limit`
 * of each kind, merges/sorts, then applies a final combined `limit`.
 */
export async function fetchContactActivityHistory(input: {
  prospectId: number;
  salesLineId: string | null;
  limit?: number;
}): Promise<{ data: ContactActivityItem[]; error: string | null }> {
  const limit = input.limit ?? CONTACT_ACTIVITY_HISTORY_LIMIT;

  const [callsResult, emailsResult] = await Promise.all([
    fetchPreviousCallsForLog({
      prospectId: input.prospectId,
      salesLineId: input.salesLineId,
      limit,
    }),
    fetchSentProductEmailsForAccount({
      prospectId: input.prospectId,
      salesLineId: input.salesLineId,
      limit,
    }),
  ]);

  if (callsResult.error && emailsResult.error) {
    return { data: [], error: callsResult.error };
  }

  const callItems = callsResult.data.map(mapCallToActivityItem);
  const emailItems = emailsResult.data;
  const merged = mergeContactActivityHistory(callItems, emailItems, limit);

  return {
    data: merged,
    error: callsResult.error ?? emailsResult.error,
  };
}
