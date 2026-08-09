import { isValidOgrProductEmailRecipient } from '@/lib/ogrProductEmailLimits';

export const GMAIL_MAX_SUBJECT = 200;
export const GMAIL_MAX_BODY_TEXT = 50_000;
export const GMAIL_MAX_RECIPIENTS = 50;

export type MimeAddressList = string[];

export type BuildMimeMessageInput = {
  to: MimeAddressList;
  cc?: MimeAddressList;
  bcc?: MimeAddressList;
  subject: string;
  bodyText: string;
  inReplyTo?: string;
  references?: string;
};

export class GmailMimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GmailMimeError';
  }
}

/** Extract bare email from "Name <email@x.com>" or bare address. */
export function extractEmailAddress(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const angle = trimmed.match(/<([^>]+)>/);
  const candidate = (angle?.[1] ?? trimmed).trim();
  if (!isValidOgrProductEmailRecipient(candidate)) return null;
  return candidate.toLowerCase();
}

export function parseAddressList(headerValue: string | undefined | null): string[] {
  if (!headerValue?.trim()) return [];
  const parts = headerValue.split(',');
  const emails: string[] = [];
  for (const part of parts) {
    const email = extractEmailAddress(part);
    if (email && !emails.includes(email)) emails.push(email);
  }
  return emails;
}

export function normalizeSubjectForReply(subject: string): string {
  const trimmed = subject.trim() || '(no subject)';
  if (/^re:\s/i.test(trimmed)) return trimmed;
  return `Re: ${trimmed}`;
}

export function buildReplyAllRecipients(params: {
  fromHeader: string;
  toHeader: string;
  ccHeader: string;
  selfEmail: string;
}): { to: string[]; cc: string[] } {
  const self = params.selfEmail.trim().toLowerCase();
  const from = extractEmailAddress(params.fromHeader);
  const toAddrs = parseAddressList(params.toHeader);
  const ccAddrs = parseAddressList(params.ccHeader);

  const to: string[] = [];
  if (from && from !== self) to.push(from);
  for (const addr of toAddrs) {
    if (addr !== self && !to.includes(addr)) to.push(addr);
  }

  const cc: string[] = [];
  for (const addr of ccAddrs) {
    if (addr !== self && !to.includes(addr) && !cc.includes(addr)) cc.push(addr);
  }

  return { to, cc };
}

function encodeHeaderValue(value: string): string {
  // ASCII-safe path; reject control chars that break headers.
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      throw new GmailMimeError('Header value contains control characters');
    }
  }
  return value;
}

function formatAddressHeader(addresses: string[]): string {
  return addresses.join(', ');
}

function validateRecipients(list: string[] | undefined, label: string): string[] {
  if (!list?.length) return [];
  if (list.length > GMAIL_MAX_RECIPIENTS) {
    throw new GmailMimeError(`Too many ${label} recipients`);
  }
  const out: string[] = [];
  for (const raw of list) {
    const email = extractEmailAddress(raw);
    if (!email) throw new GmailMimeError(`Invalid ${label} recipient`);
    if (!out.includes(email)) out.push(email);
  }
  return out;
}

/** Build RFC 2822 plain-text message (no From — Gmail sets the connected account). */
export function buildRfc2822Message(input: BuildMimeMessageInput): string {
  const to = validateRecipients(input.to, 'to');
  if (to.length === 0) throw new GmailMimeError('At least one To recipient is required');
  const cc = validateRecipients(input.cc, 'cc');
  const bcc = validateRecipients(input.bcc, 'bcc');

  const subject = input.subject.trim();
  if (!subject) throw new GmailMimeError('Subject is required');
  if (subject.length > GMAIL_MAX_SUBJECT) throw new GmailMimeError('Subject is too long');

  const bodyText = input.bodyText ?? '';
  if (bodyText.length > GMAIL_MAX_BODY_TEXT) throw new GmailMimeError('Body is too long');

  const lines: string[] = [];
  lines.push(`To: ${formatAddressHeader(to)}`);
  if (cc.length) lines.push(`Cc: ${formatAddressHeader(cc)}`);
  if (bcc.length) lines.push(`Bcc: ${formatAddressHeader(bcc)}`);
  lines.push(`Subject: ${encodeHeaderValue(subject)}`);
  if (input.inReplyTo?.trim()) {
    lines.push(`In-Reply-To: ${encodeHeaderValue(input.inReplyTo.trim())}`);
  }
  if (input.references?.trim()) {
    lines.push(`References: ${encodeHeaderValue(input.references.trim())}`);
  }
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/plain; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: 8bit');
  lines.push('');
  lines.push(bodyText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n'));
  return lines.join('\r\n');
}

/** Base64url encode (no padding) for Gmail `raw`. */
export function encodeGmailRaw(rfc2822: string): string {
  return Buffer.from(rfc2822, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function buildGmailRawMessage(input: BuildMimeMessageInput): string {
  return encodeGmailRaw(buildRfc2822Message(input));
}

export function chainReferences(existing: string | undefined, messageId: string): string {
  const id = messageId.trim();
  if (!id) return existing?.trim() ?? '';
  const prior = (existing ?? '')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!prior.includes(id)) prior.push(id);
  return prior.join(' ');
}
