import type { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import type { Database, SystemMessage, SystemMessageUpdate } from '@/types/database';

type DbClient = SupabaseClient<Database>;

export const HANDLED_RESEND_EVENT_TYPES = [
  'email.sent',
  'email.delivered',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.failed',
  'email.complained',
] as const;

export type HandledResendEventType = (typeof HANDLED_RESEND_EVENT_TYPES)[number];

const TERMINAL_STATUSES = new Set(['bounced', 'failed', 'complained']);

export type NormalizedResendWebhookEvent = {
  type: string;
  emailId: string;
  occurredAt: string;
  failureReason: string | null;
  /** Trimmed audit payload — never full HTML. */
  payload: Record<string, unknown>;
};

export type SystemMessageWebhookCurrent = Pick<
  SystemMessage,
  | 'status'
  | 'sent_at'
  | 'delivered_at'
  | 'opened_at'
  | 'clicked_at'
  | 'last_opened_at'
  | 'last_clicked_at'
  | 'last_engagement_received_at'
  | 'bounced_at'
  | 'failed_at'
  | 'complained_at'
  | 'open_count'
  | 'click_count'
  | 'last_event_at'
  | 'failure_reason'
>;

export type SystemMessageWebhookPatch = SystemMessageUpdate & {
  status: string;
  open_count: number;
  click_count: number;
  last_event_at: string;
};

export function isHandledResendEventType(type: string): type is HandledResendEventType {
  return (HANDLED_RESEND_EVENT_TYPES as readonly string[]).includes(type);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function pickString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * Verify Resend/Svix signature using the Resend SDK.
 * Requires the raw request body string (do not re-stringify parsed JSON).
 */
export function verifyResendWebhook(input: {
  rawBody: string;
  headers: Headers | Record<string, string | null | undefined>;
  secret: string;
}): unknown {
  const headerGet = (name: string): string => {
    if (input.headers instanceof Headers) {
      return input.headers.get(name) ?? '';
    }
    const direct = input.headers[name] ?? input.headers[name.toLowerCase()];
    return typeof direct === 'string' ? direct : '';
  };

  const id = headerGet('svix-id');
  const timestamp = headerGet('svix-timestamp');
  const signature = headerGet('svix-signature');
  if (!id || !timestamp || !signature) {
    throw new Error('Missing Svix webhook headers');
  }

  const resend = new Resend('re_webhook_verify_only');
  return resend.webhooks.verify({
    payload: input.rawBody,
    headers: {
      id,
      timestamp,
      signature,
    },
    webhookSecret: input.secret,
  });
}

export function normalizeResendWebhookEvent(parsed: unknown): NormalizedResendWebhookEvent | null {
  const root = asRecord(parsed);
  if (!root) return null;

  const type = pickString(root.type);
  const data = asRecord(root.data);
  if (!type || !data) return null;

  const emailId = pickString(data.email_id) ?? pickString(data.id);
  if (!emailId) return null;

  const createdAt =
    pickString(root.created_at) ?? pickString(data.created_at) ?? new Date().toISOString();

  let failureReason: string | null = null;
  const bounce = asRecord(data.bounce);
  const bounceMessage = bounce ? pickString(bounce.message) : null;
  if (bounceMessage) failureReason = bounceMessage;
  const failed = asRecord(data.failed);
  const failedMessage = failed ? pickString(failed.message) : null;
  if (!failureReason && failedMessage) failureReason = failedMessage;
  if (!failureReason) {
    failureReason = pickString(data.reason) ?? pickString(root.reason);
  }

  const payload: Record<string, unknown> = {
    type,
    email_id: emailId,
    created_at: createdAt,
  };
  if (failureReason) payload.failure_reason = failureReason;
  if (bounce) {
    payload.bounce = {
      message: bounceMessage,
      type: pickString(bounce.type),
    };
  }

  return {
    type,
    emailId,
    occurredAt: createdAt,
    failureReason,
    payload,
  };
}

function maxIso(a: string | null | undefined, b: string): string {
  if (!a) return b;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

/**
 * Pure status/counter patch for a verified Resend event.
 * Open/click never change status; terminals never regress to delivered/sent.
 */
export function computeSystemMessageWebhookPatch(
  current: SystemMessageWebhookCurrent,
  event: Pick<NormalizedResendWebhookEvent, 'type' | 'occurredAt' | 'failureReason'>,
  options?: { receivedAt?: string },
): SystemMessageWebhookPatch {
  const patch: SystemMessageWebhookPatch = {
    status: current.status,
    open_count: current.open_count,
    click_count: current.click_count,
    last_event_at: maxIso(current.last_event_at, event.occurredAt),
  };

  const terminal = TERMINAL_STATUSES.has(current.status);
  const receivedAt = options?.receivedAt ?? new Date().toISOString();

  switch (event.type) {
    case 'email.sent': {
      if (!current.sent_at) patch.sent_at = event.occurredAt;
      if (!terminal && current.status !== 'delivered') {
        // Keep existing sent/queued; do not regress delivered.
        if (
          current.status === 'draft' ||
          current.status === 'queued' ||
          current.status === 'sending'
        ) {
          patch.status = 'sent';
        }
      }
      break;
    }
    case 'email.delivered': {
      if (!terminal) {
        patch.status = 'delivered';
        if (!current.delivered_at) patch.delivered_at = event.occurredAt;
      } else if (!current.delivered_at) {
        // Record delivery time only if somehow missing; never leave terminal status.
        patch.delivered_at = event.occurredAt;
      }
      break;
    }
    case 'email.opened': {
      patch.open_count = current.open_count + 1;
      if (!current.opened_at) patch.opened_at = event.occurredAt;
      patch.last_opened_at = maxIso(current.last_opened_at, event.occurredAt);
      patch.last_engagement_received_at = receivedAt;
      break;
    }
    case 'email.clicked': {
      patch.click_count = current.click_count + 1;
      if (!current.clicked_at) patch.clicked_at = event.occurredAt;
      patch.last_clicked_at = maxIso(current.last_clicked_at, event.occurredAt);
      patch.last_engagement_received_at = receivedAt;
      break;
    }
    case 'email.bounced': {
      patch.status = 'bounced';
      if (!current.bounced_at) patch.bounced_at = event.occurredAt;
      if (event.failureReason) patch.failure_reason = event.failureReason;
      break;
    }
    case 'email.failed': {
      if (current.status !== 'bounced' && current.status !== 'complained') {
        patch.status = 'failed';
      }
      if (!current.failed_at) patch.failed_at = event.occurredAt;
      if (event.failureReason && (current.status !== 'bounced' || !current.failure_reason)) {
        patch.failure_reason = event.failureReason;
      }
      break;
    }
    case 'email.complained': {
      patch.status = 'complained';
      if (!current.complained_at) patch.complained_at = event.occurredAt;
      break;
    }
    default:
      break;
  }

  return patch;
}

export type ApplyResendSystemMessageEventInput = {
  resendEventId: string;
  event: NormalizedResendWebhookEvent;
};

export type ApplyResendSystemMessageEventResult =
  | { ok: true; duplicate: true }
  | { ok: true; duplicate: false; systemMessageId: string; unknownEmail?: false }
  | { ok: true; duplicate: false; unknownEmail: true }
  | { ok: false; error: string };

/**
 * Idempotent apply via DB RPC: FOR UPDATE + unique event insert + atomic open/click increments.
 * Service-role client required (webhook has no staff JWT).
 * `computeSystemMessageWebhookPatch` remains for unit tests of patch semantics.
 */
export async function applyResendSystemMessageEvent(
  admin: DbClient,
  input: ApplyResendSystemMessageEventInput,
): Promise<ApplyResendSystemMessageEventResult> {
  const { data, error } = await admin.rpc('apply_resend_system_message_event', {
    p_resend_email_id: input.event.emailId,
    p_resend_event_id: input.resendEventId,
    p_event_type: input.event.type,
    p_occurred_at: input.event.occurredAt,
    p_payload: input.event.payload,
    p_failure_reason: input.event.failureReason,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const result = asRecord(data);
  const status = result ? pickString(result.status) : null;

  if (status === 'unknown_email') {
    return { ok: true, duplicate: false, unknownEmail: true };
  }
  if (status === 'duplicate') {
    return { ok: true, duplicate: true };
  }
  if (status === 'applied') {
    const systemMessageId = result ? pickString(result.system_message_id) : null;
    if (!systemMessageId) {
      return { ok: false, error: 'RPC applied without system_message_id' };
    }
    return { ok: true, duplicate: false, systemMessageId };
  }

  const rpcError = result ? pickString(result.error) : null;
  return {
    ok: false,
    error: rpcError ?? `Unexpected RPC status: ${status ?? 'null'}`,
  };
}

export async function bufferUnmatchedResendEvent(
  admin: DbClient,
  input: ApplyResendSystemMessageEventInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin.from('resend_unmatched_events').upsert(
    {
      resend_email_id: input.event.emailId,
      resend_event_id: input.resendEventId,
      event_type: input.event.type,
      occurred_at: input.event.occurredAt,
      payload: input.event.payload,
      failure_reason: input.event.failureReason,
      resolved_at: null,
    },
    { onConflict: 'resend_event_id', ignoreDuplicates: true },
  );

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export type ReplayUnmatchedResendEventsResult = {
  attempted: number;
  applied: number;
  duplicates: number;
  failed: number;
};

/**
 * Re-apply buffered webhook events once system_messages.resend_email_id exists.
 * Marks unmatched rows resolved on applied/duplicate outcomes.
 */
export async function replayUnmatchedResendEvents(
  admin: DbClient,
  resendEmailId: string,
): Promise<ReplayUnmatchedResendEventsResult> {
  const trimmed = resendEmailId.trim();
  const result: ReplayUnmatchedResendEventsResult = {
    attempted: 0,
    applied: 0,
    duplicates: 0,
    failed: 0,
  };
  if (!trimmed) return result;

  const { data, error } = await admin
    .from('resend_unmatched_events')
    .select(
      'id, resend_email_id, resend_event_id, event_type, occurred_at, payload, failure_reason',
    )
    .eq('resend_email_id', trimmed)
    .is('resolved_at', null)
    .order('occurred_at', { ascending: true });

  if (error || !data?.length) return result;

  const now = new Date().toISOString();
  for (const row of data) {
    result.attempted += 1;
    const apply = await applyResendSystemMessageEvent(admin, {
      resendEventId: row.resend_event_id,
      event: {
        type: row.event_type,
        emailId: row.resend_email_id,
        occurredAt: row.occurred_at,
        failureReason: row.failure_reason,
        payload:
          row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>)
            : {},
      },
    });

    if (!apply.ok || ('unknownEmail' in apply && apply.unknownEmail)) {
      result.failed += 1;
      continue;
    }

    if (apply.duplicate) {
      result.duplicates += 1;
    } else {
      result.applied += 1;
    }

    await admin
      .from('resend_unmatched_events')
      .update({ resolved_at: now })
      .eq('id', row.id)
      .is('resolved_at', null);
  }

  return result;
}
