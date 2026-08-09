import { GmailClientError } from '@/lib/google/gmailClient';
import {
  buildGmailRawMessage,
  buildReplyAllRecipients,
  chainReferences,
  extractEmailAddress,
  normalizeSubjectForReply,
  parseAddressList,
  type BuildMimeMessageInput,
} from '@/lib/google/gmailMime';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export type GmailSendResult = {
  id: string;
  threadId: string;
  labelIds: string[];
};

export type GmailDraftSummary = {
  id: string;
  messageId: string | null;
  threadId: string | null;
  subject: string;
  snippet: string;
  to: string;
  date: string | null;
};

export type GmailDraftDetail = GmailDraftSummary & {
  raw?: never;
  toList: string[];
  ccList: string[];
  bccList: string[];
  bodyText: string;
};

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
  headers?: GmailHeader[];
};

type GmailMessageResource = {
  id?: string;
  threadId?: string;
  snippet?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: GmailPart;
};

type GmailDraftResource = {
  id?: string;
  message?: GmailMessageResource;
};

function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  if (!headers) return '';
  const found = headers.find((h) => (h.name ?? '').toLowerCase() === name.toLowerCase());
  return found?.value?.trim() ?? '';
}

function decodeBase64Url(data: string | undefined): string {
  if (!data) return '';
  try {
    const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(normalized + pad, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function collectParts(part: GmailPart | undefined, out: GmailPart[]): void {
  if (!part) return;
  out.push(part);
  for (const child of part.parts ?? []) {
    collectParts(child, out);
  }
}

function extractPlainBody(payload: GmailPart | undefined): string {
  const parts: GmailPart[] = [];
  collectParts(payload, parts);
  for (const part of parts) {
    if ((part.mimeType ?? '').toLowerCase() === 'text/plain') {
      const decoded = decodeBase64Url(part.body?.data);
      if (decoded) return decoded;
    }
  }
  if (payload?.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  return '';
}

async function gmailFetchJson<T>(params: {
  accessToken: string;
  url: string;
  method?: string;
  body?: unknown;
  fetchImpl?: typeof fetch;
}): Promise<T> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const res = await fetchImpl(params.url, {
    method: params.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      ...(params.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: params.body !== undefined ? JSON.stringify(params.body) : undefined,
  });
  if (res.status === 204) {
    return {} as T;
  }
  let json: T & { error?: { message?: string; status?: string; errors?: { reason?: string }[] } };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new GmailClientError(`Gmail API error (${res.status})`, { status: res.status });
  }
  if (!res.ok) {
    throw new GmailClientError(json.error?.message ?? `Gmail API error (${res.status})`, {
      status: res.status,
      reason: json.error?.errors?.[0]?.reason ?? json.error?.status,
    });
  }
  return json;
}

function mapSendResult(msg: GmailMessageResource): GmailSendResult {
  return {
    id: msg.id ?? '',
    threadId: msg.threadId ?? '',
    labelIds: msg.labelIds ?? [],
  };
}

export async function sendGmailMessage(params: {
  accessToken: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  fetchImpl?: typeof fetch;
}): Promise<GmailSendResult> {
  const raw = buildGmailRawMessage({
    to: params.to,
    cc: params.cc,
    bcc: params.bcc,
    subject: params.subject,
    bodyText: params.bodyText,
    inReplyTo: params.inReplyTo,
    references: params.references,
  });
  const body: { raw: string; threadId?: string } = { raw };
  if (params.threadId?.trim()) body.threadId = params.threadId.trim();

  const msg = await gmailFetchJson<GmailMessageResource>({
    accessToken: params.accessToken,
    url: `${GMAIL_API}/messages/send`,
    method: 'POST',
    body,
    fetchImpl: params.fetchImpl,
  });
  return mapSendResult(msg);
}

async function fetchMessageMetadata(params: {
  accessToken: string;
  messageId: string;
  fetchImpl?: typeof fetch;
}): Promise<GmailMessageResource> {
  const url = new URL(`${GMAIL_API}/messages/${encodeURIComponent(params.messageId)}`);
  url.searchParams.set('format', 'metadata');
  for (const h of ['From', 'To', 'Cc', 'Subject', 'Message-ID', 'References', 'In-Reply-To']) {
    url.searchParams.append('metadataHeaders', h);
  }
  return gmailFetchJson<GmailMessageResource>({
    accessToken: params.accessToken,
    url: url.toString(),
    fetchImpl: params.fetchImpl,
  });
}

async function resolveReplyTargetMessage(params: {
  accessToken: string;
  threadId: string;
  messageId?: string;
  fetchImpl?: typeof fetch;
}): Promise<GmailMessageResource> {
  if (params.messageId?.trim()) {
    return fetchMessageMetadata({
      accessToken: params.accessToken,
      messageId: params.messageId.trim(),
      fetchImpl: params.fetchImpl,
    });
  }
  const url = new URL(`${GMAIL_API}/threads/${encodeURIComponent(params.threadId)}`);
  url.searchParams.set('format', 'metadata');
  for (const h of ['From', 'To', 'Cc', 'Subject', 'Message-ID', 'References', 'In-Reply-To']) {
    url.searchParams.append('metadataHeaders', h);
  }
  const thread = await gmailFetchJson<{ messages?: GmailMessageResource[] }>({
    accessToken: params.accessToken,
    url: url.toString(),
    fetchImpl: params.fetchImpl,
  });
  const messages = thread.messages ?? [];
  const latest = messages[messages.length - 1];
  if (!latest?.id) throw new GmailClientError('Thread has no messages to reply to');
  return latest;
}

export async function replyToGmailThread(params: {
  accessToken: string;
  threadId: string;
  mode: 'reply' | 'reply_all';
  bodyText: string;
  selfEmail: string;
  messageId?: string;
  fetchImpl?: typeof fetch;
}): Promise<GmailSendResult> {
  const threadId = params.threadId.trim();
  if (!threadId) throw new GmailClientError('threadId is required');

  const target = await resolveReplyTargetMessage({
    accessToken: params.accessToken,
    threadId,
    messageId: params.messageId,
    fetchImpl: params.fetchImpl,
  });

  const headers = target.payload?.headers;
  const messageIdHeader = headerValue(headers, 'Message-ID');
  const existingRefs = headerValue(headers, 'References');
  const subject = normalizeSubjectForReply(headerValue(headers, 'Subject'));
  const fromHeader = headerValue(headers, 'From');
  const toHeader = headerValue(headers, 'To');
  const ccHeader = headerValue(headers, 'Cc');

  let to: string[];
  let cc: string[] | undefined;
  if (params.mode === 'reply_all') {
    const recipients = buildReplyAllRecipients({
      fromHeader,
      toHeader,
      ccHeader,
      selfEmail: params.selfEmail,
    });
    to = recipients.to;
    cc = recipients.cc;
  } else {
    const from = extractEmailAddress(fromHeader);
    to = from ? [from] : [];
  }
  if (to.length === 0) {
    throw new GmailClientError('Could not determine reply recipient');
  }

  return sendGmailMessage({
    accessToken: params.accessToken,
    to,
    cc,
    subject,
    bodyText: params.bodyText,
    threadId,
    inReplyTo: messageIdHeader || undefined,
    references: chainReferences(existingRefs || undefined, messageIdHeader) || undefined,
    fetchImpl: params.fetchImpl,
  });
}

function mapDraftSummary(draft: GmailDraftResource): GmailDraftSummary {
  const msg = draft.message;
  const headers = msg?.payload?.headers;
  return {
    id: draft.id ?? '',
    messageId: msg?.id ?? null,
    threadId: msg?.threadId ?? null,
    subject: headerValue(headers, 'Subject') || '(no subject)',
    snippet: msg?.snippet ?? '',
    to: headerValue(headers, 'To'),
    date: msg?.internalDate ? new Date(Number(msg.internalDate)).toISOString() : null,
  };
}

export async function listGmailDrafts(params: {
  accessToken: string;
  maxResults?: number;
  pageToken?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ drafts: GmailDraftSummary[]; nextPageToken: string | null }> {
  const maxResults = Math.min(Math.max(params.maxResults ?? 25, 1), 25);
  const listUrl = new URL(`${GMAIL_API}/drafts`);
  listUrl.searchParams.set('maxResults', String(maxResults));
  if (params.pageToken?.trim()) listUrl.searchParams.set('pageToken', params.pageToken.trim());

  const list = await gmailFetchJson<{ drafts?: { id?: string }[]; nextPageToken?: string }>({
    accessToken: params.accessToken,
    url: listUrl.toString(),
    fetchImpl: params.fetchImpl,
  });

  const draftIds = (list.drafts ?? [])
    .map((entry) => entry.id)
    .filter((id): id is string => Boolean(id));
  const drafts = await Promise.all(
    draftIds.map(async (id) => {
      const detail = await gmailFetchJson<GmailDraftResource>({
        accessToken: params.accessToken,
        url: `${GMAIL_API}/drafts/${encodeURIComponent(id)}?format=metadata`,
        fetchImpl: params.fetchImpl,
      });
      return mapDraftSummary(detail);
    }),
  );
  return { drafts, nextPageToken: list.nextPageToken ?? null };
}

export async function getGmailDraft(params: {
  accessToken: string;
  draftId: string;
  fetchImpl?: typeof fetch;
}): Promise<GmailDraftDetail> {
  const draftId = params.draftId.trim();
  if (!draftId) throw new GmailClientError('draftId is required');
  const draft = await gmailFetchJson<GmailDraftResource>({
    accessToken: params.accessToken,
    url: `${GMAIL_API}/drafts/${encodeURIComponent(draftId)}?format=full`,
    fetchImpl: params.fetchImpl,
  });
  const summary = mapDraftSummary(draft);
  const headers = draft.message?.payload?.headers;
  return {
    ...summary,
    toList: parseAddressList(headerValue(headers, 'To')),
    ccList: parseAddressList(headerValue(headers, 'Cc')),
    bccList: parseAddressList(headerValue(headers, 'Bcc')),
    bodyText: extractPlainBody(draft.message?.payload),
  };
}

function mimeInputFromDraftFields(fields: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  inReplyTo?: string;
  references?: string;
}): BuildMimeMessageInput {
  return {
    to: fields.to,
    cc: fields.cc,
    bcc: fields.bcc,
    subject: fields.subject,
    bodyText: fields.bodyText,
    inReplyTo: fields.inReplyTo,
    references: fields.references,
  };
}

export async function createGmailDraft(params: {
  accessToken: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  fetchImpl?: typeof fetch;
}): Promise<GmailDraftSummary> {
  const raw = buildGmailRawMessage(
    mimeInputFromDraftFields({
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: params.subject,
      bodyText: params.bodyText,
      inReplyTo: params.inReplyTo,
      references: params.references,
    }),
  );
  const message: { raw: string; threadId?: string } = { raw };
  if (params.threadId?.trim()) message.threadId = params.threadId.trim();

  const draft = await gmailFetchJson<GmailDraftResource>({
    accessToken: params.accessToken,
    url: `${GMAIL_API}/drafts`,
    method: 'POST',
    body: { message },
    fetchImpl: params.fetchImpl,
  });
  return mapDraftSummary(draft);
}

export async function updateGmailDraft(params: {
  accessToken: string;
  draftId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  fetchImpl?: typeof fetch;
}): Promise<GmailDraftSummary> {
  const draftId = params.draftId.trim();
  if (!draftId) throw new GmailClientError('draftId is required');
  const raw = buildGmailRawMessage(
    mimeInputFromDraftFields({
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: params.subject,
      bodyText: params.bodyText,
      inReplyTo: params.inReplyTo,
      references: params.references,
    }),
  );
  const message: { raw: string; threadId?: string } = { raw };
  if (params.threadId?.trim()) message.threadId = params.threadId.trim();

  const draft = await gmailFetchJson<GmailDraftResource>({
    accessToken: params.accessToken,
    url: `${GMAIL_API}/drafts/${encodeURIComponent(draftId)}`,
    method: 'PUT',
    body: { id: draftId, message },
    fetchImpl: params.fetchImpl,
  });
  return mapDraftSummary(draft);
}

export async function sendGmailDraft(params: {
  accessToken: string;
  draftId: string;
  fetchImpl?: typeof fetch;
}): Promise<GmailSendResult> {
  const draftId = params.draftId.trim();
  if (!draftId) throw new GmailClientError('draftId is required');
  const msg = await gmailFetchJson<GmailMessageResource>({
    accessToken: params.accessToken,
    url: `${GMAIL_API}/drafts/send`,
    method: 'POST',
    body: { id: draftId },
    fetchImpl: params.fetchImpl,
  });
  return mapSendResult(msg);
}

export async function deleteGmailDraft(params: {
  accessToken: string;
  draftId: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const draftId = params.draftId.trim();
  if (!draftId) throw new GmailClientError('draftId is required');
  await gmailFetchJson<Record<string, never>>({
    accessToken: params.accessToken,
    url: `${GMAIL_API}/drafts/${encodeURIComponent(draftId)}`,
    method: 'DELETE',
    fetchImpl: params.fetchImpl,
  });
}

export const GMAIL_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export async function downloadGmailAttachment(params: {
  accessToken: string;
  messageId: string;
  attachmentId: string;
  fetchImpl?: typeof fetch;
}): Promise<{ data: Buffer; size: number }> {
  const messageId = params.messageId.trim();
  const attachmentId = params.attachmentId.trim();
  if (!messageId || !attachmentId) {
    throw new GmailClientError('messageId and attachmentId are required');
  }
  const url = `${GMAIL_API}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`;
  const json = await gmailFetchJson<{ data?: string; size?: number }>({
    accessToken: params.accessToken,
    url,
    fetchImpl: params.fetchImpl,
  });
  if (!json.data) throw new GmailClientError('Attachment data missing');
  const normalized = json.data.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const data = Buffer.from(normalized + pad, 'base64');
  if (data.length > GMAIL_ATTACHMENT_MAX_BYTES) {
    throw new GmailClientError('Attachment exceeds size limit');
  }
  return { data, size: data.length };
}
