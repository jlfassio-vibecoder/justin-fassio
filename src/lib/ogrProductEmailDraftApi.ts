import {
  isValidOgrProductEmailRecipient,
  OGR_PRODUCT_EMAIL_MAX_PROSE,
  OGR_PRODUCT_EMAIL_MAX_RECIPIENT_NAME,
  OGR_PRODUCT_EMAIL_MAX_SUBJECT,
  OGR_PRODUCT_EMAIL_MAX_TO,
} from '@/lib/ogrProductEmailLimits';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function jsonOk(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, ...body }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function rejectUnsupportedSendFields(body: Record<string, unknown>): string | null {
  if (
    body.html != null ||
    body.from != null ||
    body.signatureName != null ||
    body.productHref != null
  ) {
    return 'Unsupported fields in request';
  }
  return null;
}

export function requireBoundedString(
  value: unknown,
  max: number,
  label: string,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string') {
    return { ok: false, error: `${label} must be a string` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, error: `${label} is required` };
  }
  if (trimmed.length > max) {
    return { ok: false, error: `${label} is too long` };
  }
  return { ok: true, value: trimmed };
}

export function optionalBoundedString(
  value: unknown,
  max: number,
  label: string,
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: undefined };
  if (typeof value !== 'string') {
    return { ok: false, error: `${label} must be a string` };
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    return { ok: false, error: `${label} is too long` };
  }
  return { ok: true, value: trimmed || undefined };
}

export function requireRecipientEmail(
  value: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string') {
    return { ok: false, error: 'to must be a string' };
  }
  const trimmed = value.trim();
  if (trimmed.length > OGR_PRODUCT_EMAIL_MAX_TO) {
    return { ok: false, error: 'to is too long' };
  }
  if (!isValidOgrProductEmailRecipient(trimmed)) {
    return { ok: false, error: 'A valid recipient email is required' };
  }
  return { ok: true, value: trimmed };
}

export function requireProspectId(
  value: unknown,
): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return { ok: true, value };
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed > 0) return { ok: true, value: parsed };
  }
  return { ok: false, error: 'prospectId must be a positive integer' };
}

export function requireAccountContactId(
  value: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string') {
    return { ok: false, error: 'accountContactId must be a string' };
  }
  const trimmed = value.trim();
  if (!UUID_RE.test(trimmed)) {
    return { ok: false, error: 'accountContactId must be a valid UUID' };
  }
  return { ok: true, value: trimmed };
}

export function requireProductId(
  value: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string' || !UUID_RE.test(value.trim())) {
    return { ok: false, error: 'productId must be a valid UUID' };
  }
  return { ok: true, value: value.trim() };
}

export function requireDraftId(
  value: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string' || !UUID_RE.test(value.trim())) {
    return { ok: false, error: 'Draft id must be a valid UUID' };
  }
  return { ok: true, value: value.trim() };
}

export const DRAFT_FIELD_LIMITS = {
  toName: OGR_PRODUCT_EMAIL_MAX_RECIPIENT_NAME,
  subject: OGR_PRODUCT_EMAIL_MAX_SUBJECT,
  prose: OGR_PRODUCT_EMAIL_MAX_PROSE,
} as const;

export function serializeAgentDraft(draft: {
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
  payload: {
    sku: string;
    name: string;
    slug: string;
    productHref: string;
    from?: string;
  };
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: draft.id,
    messageType: draft.messageType,
    origin: draft.origin,
    status: draft.status,
    catalogItemId: draft.catalogItemId,
    resendEmailId: draft.resendEmailId,
    toEmail: draft.toEmail,
    toName: draft.toName,
    subject: draft.subject,
    introText: draft.introText,
    closingText: draft.closingText,
    prospectId: draft.prospectId,
    accountContactId: draft.accountContactId,
    sentBy: draft.sentBy,
    queuedAt: draft.queuedAt,
    sentAt: draft.sentAt,
    payload: draft.payload,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}
