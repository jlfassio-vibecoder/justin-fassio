import {
  extractEmailAddress,
  GMAIL_MAX_BODY_TEXT,
  GMAIL_MAX_RECIPIENTS,
  GMAIL_MAX_SUBJECT,
  GmailMimeError,
} from '@/lib/google/gmailMime';

export type ParsedComposeBody = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyText: string;
  threadId?: string;
};

function parseRecipientField(value: unknown, label: string): string[] {
  if (value == null || value === '') return [];
  const rawList: string[] = Array.isArray(value)
    ? value.map((v) => String(v))
    : String(value)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  if (rawList.length > GMAIL_MAX_RECIPIENTS) {
    throw new GmailMimeError(`Too many ${label} recipients`);
  }
  const out: string[] = [];
  for (const raw of rawList) {
    const email = extractEmailAddress(raw);
    if (!email) throw new GmailMimeError(`Invalid ${label} recipient`);
    if (!out.includes(email)) out.push(email);
  }
  return out;
}

/** Reject client-supplied raw MIME / From override; parse compose fields. */
export function parseComposeRequestBody(body: unknown): ParsedComposeBody {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new GmailMimeError('Invalid JSON body');
  }
  const obj = body as Record<string, unknown>;
  if ('raw' in obj) throw new GmailMimeError('Client raw MIME is not allowed');
  if ('from' in obj || 'From' in obj) throw new GmailMimeError('From override is not allowed');

  const to = parseRecipientField(obj.to, 'to');
  const cc = parseRecipientField(obj.cc, 'cc');
  const bcc = parseRecipientField(obj.bcc, 'bcc');
  const subject = typeof obj.subject === 'string' ? obj.subject.trim() : '';
  const bodyText = typeof obj.bodyText === 'string' ? obj.bodyText : '';
  if (!subject) throw new GmailMimeError('Subject is required');
  if (subject.length > GMAIL_MAX_SUBJECT) throw new GmailMimeError('Subject is too long');
  if (bodyText.length > GMAIL_MAX_BODY_TEXT) throw new GmailMimeError('Body is too long');

  const threadId =
    typeof obj.threadId === 'string' && obj.threadId.trim() ? obj.threadId.trim() : undefined;

  return { to, cc, bcc, subject, bodyText, threadId };
}

export function parseReplyRequestBody(body: unknown): {
  mode: 'reply' | 'reply_all';
  bodyText: string;
  messageId?: string;
} {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new GmailMimeError('Invalid JSON body');
  }
  const obj = body as Record<string, unknown>;
  if ('raw' in obj) throw new GmailMimeError('Client raw MIME is not allowed');
  if ('from' in obj || 'From' in obj) throw new GmailMimeError('From override is not allowed');

  const mode = obj.mode === 'reply_all' ? 'reply_all' : obj.mode === 'reply' ? 'reply' : null;
  if (!mode) throw new GmailMimeError('mode must be reply or reply_all');
  const bodyText = typeof obj.bodyText === 'string' ? obj.bodyText : '';
  if (bodyText.length > GMAIL_MAX_BODY_TEXT) throw new GmailMimeError('Body is too long');
  const messageId =
    typeof obj.messageId === 'string' && obj.messageId.trim() ? obj.messageId.trim() : undefined;
  return { mode, bodyText, messageId };
}
