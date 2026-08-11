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
    pickString(root.created_at) ??
    pickString(data.created_at) ??
    new Date().toISOString();

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
): SystemMessageWebhookPatch {
  const patch: SystemMessageWebhookPatch = {
    status: current.status,
    open_count: current.open_count,
    click_count: current.click_count,
    last_event_at: maxIso(current.last_event_at, event.occurredAt),
  };

  const terminal = TERMINAL_STATUSES.has(current.status);

  switch (event.type) {
    case 'email.sent': {
      if (!current.sent_at) patch.sent_at = event.occurredAt;
      if (!terminal && current.status !== 'delivered') {
        // Keep existing sent/queued; do not regress delivered.
        if (current.status === 'draft' || current.status === 'queued' || current.status === 'sending') {
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
      break;
    }
    case 'email.clicked': {
      patch.click_count = current.click_count + 1;
      if (!current.clicked_at) patch.clicked_at = event.occurredAt;
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
 * Idempotent apply: insert event by unique svix id, then patch system_messages.
 * Service-role client required (webhook has no staff JWT).
 */
export async function applyResendSystemMessageEvent(
  admin: DbClient,
  input: ApplyResendSystemMessageEventInput,
): Promise<ApplyResendSystemMessageEventResult> {
  const { data: message, error: lookupError } = await admin
    .from('system_messages')
    .select(
      'id, status, sent_at, delivered_at, opened_at, clicked_at, bounced_at, failed_at, complained_at, open_count, click_count, last_event_at, failure_reason',
    )
    .eq('resend_email_id', input.event.emailId)
    .maybeSingle();

  if (lookupError) {
    return { ok: false, error: lookupError.message };
  }
  if (!message) {
    return { ok: true, duplicate: false, unknownEmail: true };
  }

  const { error: insertError } = await admin.from('system_message_events').insert({
    system_message_id: message.id,
    resend_email_id: input.event.emailId,
    resend_event_id: input.resendEventId,
    event_type: input.event.type,
    occurred_at: input.event.occurredAt,
    payload: input.event.payload,
  });

  if (insertError) {
    const code = 'code' in insertError ? String(insertError.code) : '';
    const isDuplicate =
      code === '23505' || /duplicate|unique/i.test(insertError.message ?? '');
    if (isDuplicate) {
      return { ok: true, duplicate: true };
    }
    return { ok: false, error: insertError.message };
  }

  const patch = computeSystemMessageWebhookPatch(message, input.event);
  const { error: updateError } = await admin
    .from('system_messages')
    .update(patch)
    .eq('id', message.id);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  return { ok: true, duplicate: false, systemMessageId: message.id };
}
