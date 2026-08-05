import type { SupabaseClient } from '@supabase/supabase-js';
import {
  identityFingerprint,
  mappingStatusAfterInbound,
  normalizeIdentityPart,
  type MappingStatus,
} from '@/lib/messageFingerprint';
import type { Database } from '@/types/database';

type AdminClient = SupabaseClient<Database>;

type ThreadRow = {
  id: string;
  prospect_id: number | null;
  mapping_status: string;
  identity_fingerprint: string;
  confirmed_fingerprint: string | null;
};

export type WholesaleInboundMessageInput = {
  orderRequestId: string;
  requestNumber: string;
  businessName: string;
  buyerName: string;
  email: string;
  phone: string;
  city: string;
  province: string;
  postalCode: string;
  retailChannel: string;
  isExistingCustomer: boolean;
  website?: string | null;
  gstHstNumber?: string | null;
  poNumber?: string | null;
  notes?: string | null;
  preferredContactMethod?: string | null;
  totalUnits: number;
  merchandiseSubtotalUsd: number;
  /** Optional CRM auto-match — stored as suggestion until staff confirms. */
  suggestedProspectId?: number | null;
  lines: Array<{
    sku: string;
    name: string;
    size: string | null;
    wholesaleUsd: number;
    quantity: number;
  }>;
};

export type UpsertWholesaleMessageResult =
  | { ok: true; threadId: string; messageId: string; createdThread: boolean }
  | { ok: false; error: string };

function buildBody(input: WholesaleInboundMessageInput): string {
  return (
    `Wholesale order request ${input.requestNumber}: ${input.totalUnits} units, ` +
    `US$${input.merchandiseSubtotalUsd.toFixed(2)} — ${input.businessName} (${input.buyerName})`
  );
}

function buildPayload(input: WholesaleInboundMessageInput): Record<string, unknown> {
  return {
    requestNumber: input.requestNumber,
    businessName: input.businessName,
    buyerName: input.buyerName,
    email: input.email,
    phone: input.phone,
    city: input.city,
    province: input.province,
    postalCode: input.postalCode,
    retailChannel: input.retailChannel,
    isExistingCustomer: input.isExistingCustomer,
    website: input.website ?? null,
    gstHstNumber: input.gstHstNumber ?? null,
    poNumber: input.poNumber ?? null,
    notes: input.notes ?? null,
    preferredContactMethod: input.preferredContactMethod ?? null,
    totalUnits: input.totalUnits,
    merchandiseSubtotalUsd: input.merchandiseSubtotalUsd,
    lines: input.lines.map((l) => ({
      sku: l.sku,
      name: l.name,
      size: l.size,
      wholesaleUsd: l.wholesaleUsd,
      quantity: l.quantity,
    })),
  };
}

async function findThreadByFingerprint(
  admin: AdminClient,
  fingerprint: string,
): Promise<{ thread: ThreadRow | null; error: string | null }> {
  const { data, error } = await admin
    .from('message_threads')
    .select('id, prospect_id, mapping_status, identity_fingerprint, confirmed_fingerprint')
    .eq('identity_fingerprint', fingerprint)
    .maybeSingle();

  if (error) return { thread: null, error: error.message };
  return { thread: (data as ThreadRow | null) ?? null, error: null };
}

/**
 * When identity fields drift, fingerprint lookup misses. Reunite by buyer email
 * from the latest inbound message payload (same source).
 */
async function findThreadByEmail(
  admin: AdminClient,
  email: string,
): Promise<{ thread: ThreadRow | null; error: string | null }> {
  const normalized = normalizeIdentityPart(email);
  if (!normalized) return { thread: null, error: null };

  const { data, error } = await admin
    .from('messages')
    .select(
      'thread_id, created_at, message_threads!inner(id, prospect_id, mapping_status, identity_fingerprint, confirmed_fingerprint, source)',
    )
    .eq('kind', 'wholesale_order_request')
    .filter('payload->>email', 'ilike', normalized)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) return { thread: null, error: error.message };

  for (const row of data ?? []) {
    const embedded = row.message_threads as unknown as ThreadRow & { source?: string };
    if (!embedded?.id) continue;
    if (embedded.source && embedded.source !== 'old-guys-rule-wholesale') continue;
    // Prefer exact normalized email match (ilike may be loose).
    return {
      thread: {
        id: embedded.id,
        prospect_id: embedded.prospect_id,
        mapping_status: embedded.mapping_status,
        identity_fingerprint: embedded.identity_fingerprint,
        confirmed_fingerprint: embedded.confirmed_fingerprint,
      },
      error: null,
    };
  }

  return { thread: null, error: null };
}

/**
 * Create or append a Message Center thread for a wholesale order request.
 * Uses service-role client (bypasses staff RLS). Failures should be logged by caller;
 * order submission itself remains successful.
 */
export async function upsertWholesaleInboundMessage(
  admin: AdminClient,
  input: WholesaleInboundMessageInput,
): Promise<UpsertWholesaleMessageResult> {
  const fingerprint = identityFingerprint({
    email: input.email,
    businessName: input.businessName,
    buyerName: input.buyerName,
  });
  const now = new Date().toISOString();
  const subject = `${input.requestNumber} · ${input.businessName}`;
  const body = buildBody(input);
  const payload = buildPayload(input);

  const byFp = await findThreadByFingerprint(admin, fingerprint);
  if (byFp.error) return { ok: false, error: byFp.error };

  let existing = byFp.thread;
  if (!existing) {
    const byEmail = await findThreadByEmail(admin, input.email);
    if (byEmail.error) return { ok: false, error: byEmail.error };
    existing = byEmail.thread;
  }

  let threadId: string;
  let createdThread = false;

  if (!existing) {
    const suggestedId =
      typeof input.suggestedProspectId === 'number' && Number.isFinite(input.suggestedProspectId)
        ? input.suggestedProspectId
        : null;
    const { data: created, error: createError } = await admin
      .from('message_threads')
      .insert({
        identity_fingerprint: fingerprint,
        mapping_status: suggestedId != null ? 'suggested' : 'unmapped',
        prospect_id: suggestedId,
        source: 'old-guys-rule-wholesale',
        subject,
        last_message_at: now,
      })
      .select('id')
      .single();

    if (createError || !created) {
      return { ok: false, error: createError?.message ?? 'Failed to create message thread' };
    }
    threadId = created.id;
    createdThread = true;
  } else {
    threadId = existing.id;
    const currentStatus = (existing.mapping_status as MappingStatus) || 'unmapped';
    const next = mappingStatusAfterInbound({
      mappingStatus: currentStatus,
      confirmedFingerprint: existing.confirmed_fingerprint,
      inboundFingerprint: fingerprint,
    });

    const update: Database['public']['Tables']['message_threads']['Update'] = {
      subject,
      last_message_at: now,
    };

    if (next.needsReconfirm) {
      update.mapping_status = next.mappingStatus;
      // Keep prospect_id as suggestion only; clear confirmed trust marker.
      update.confirmed_fingerprint = null;
    }

    const { error: updateError } = await admin
      .from('message_threads')
      .update(update)
      .eq('id', threadId);

    if (updateError) {
      return { ok: false, error: updateError.message };
    }
  }

  const { data: message, error: messageError } = await admin
    .from('messages')
    .insert({
      thread_id: threadId,
      kind: 'wholesale_order_request',
      wholesale_order_request_id: input.orderRequestId,
      body,
      payload,
    })
    .select('id')
    .single();

  if (messageError || !message) {
    return { ok: false, error: messageError?.message ?? 'Failed to insert message' };
  }

  return { ok: true, threadId, messageId: message.id, createdThread };
}
