import type {
  GmailAttachmentMeta,
  GmailLabelFilter,
  GmailMessageView,
  GmailThreadDetail,
  GmailThreadListResult,
  GmailThreadSummary,
} from '@/lib/google/gmailTypes';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const MAX_RESULTS_CAP = 25;

export class GmailClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GmailClientError';
  }
}

type GmailHeader = { name?: string; value?: string };
type GmailBody = { data?: string; size?: number; attachmentId?: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: GmailBody;
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

type GmailThreadResource = {
  id?: string;
  snippet?: string;
  historyId?: string;
  messages?: GmailMessageResource[];
};

type GmailThreadsListResponse = {
  threads?: { id?: string; snippet?: string; historyId?: string }[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
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

function extractBodies(payload: GmailPart | undefined): { text: string; html: string | null } {
  const parts: GmailPart[] = [];
  collectParts(payload, parts);
  let text = '';
  let html: string | null = null;
  for (const part of parts) {
    const mime = (part.mimeType ?? '').toLowerCase();
    const decoded = decodeBase64Url(part.body?.data);
    if (!decoded) continue;
    if (mime === 'text/plain' && !text) text = decoded;
    if (mime === 'text/html' && !html) html = decoded;
  }
  if (!text && !html && payload?.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if ((payload.mimeType ?? '').toLowerCase() === 'text/html') {
      html = decoded;
    } else {
      text = decoded;
    }
  }
  return { text, html };
}

function extractAttachments(payload: GmailPart | undefined): GmailAttachmentMeta[] {
  const parts: GmailPart[] = [];
  collectParts(payload, parts);
  const attachments: GmailAttachmentMeta[] = [];
  for (const part of parts) {
    const filename = part.filename?.trim();
    if (!filename) continue;
    attachments.push({
      filename,
      mimeType: part.mimeType ?? 'application/octet-stream',
      size: part.body?.size ?? 0,
      attachmentId: part.body?.attachmentId ?? null,
    });
  }
  return attachments;
}

function isoFromInternalDate(internalDate: string | undefined): string | null {
  if (!internalDate) return null;
  const ms = Number(internalDate);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function mapMessage(msg: GmailMessageResource): GmailMessageView {
  const headers = msg.payload?.headers;
  const { text, html } = extractBodies(msg.payload);
  const headerDate = headerValue(headers, 'Date');
  return {
    id: msg.id ?? '',
    from: headerValue(headers, 'From'),
    to: headerValue(headers, 'To'),
    cc: headerValue(headers, 'Cc'),
    date: isoFromInternalDate(msg.internalDate) ?? (headerDate || null),
    subject: headerValue(headers, 'Subject'),
    bodyText: text,
    bodyHtml: html,
    attachments: extractAttachments(msg.payload),
  };
}

function summaryFromThread(thread: GmailThreadResource): GmailThreadSummary {
  const messages = thread.messages ?? [];
  const latest = messages[messages.length - 1] ?? messages[0];
  const headers = latest?.payload?.headers;
  const unread = messages.some((m) => (m.labelIds ?? []).includes('UNREAD'));
  return {
    id: thread.id ?? '',
    subject: headerValue(headers, 'Subject') || '(no subject)',
    snippet: thread.snippet ?? latest?.snippet ?? '',
    from: headerValue(headers, 'From'),
    to: headerValue(headers, 'To'),
    date: isoFromInternalDate(latest?.internalDate),
    unread,
  };
}

async function gmailFetchJson<T>(params: {
  accessToken: string;
  url: string;
  fetchImpl?: typeof fetch;
}): Promise<T> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const res = await fetchImpl(params.url, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new GmailClientError(json.error?.message ?? `Gmail API error (${res.status})`);
  }
  return json;
}

async function fetchThreadMetadata(params: {
  accessToken: string;
  threadId: string;
  fetchImpl?: typeof fetch;
}): Promise<GmailThreadResource> {
  const url = new URL(`${GMAIL_API}/threads/${encodeURIComponent(params.threadId)}`);
  url.searchParams.append('format', 'metadata');
  url.searchParams.append('metadataHeaders', 'From');
  url.searchParams.append('metadataHeaders', 'To');
  url.searchParams.append('metadataHeaders', 'Subject');
  url.searchParams.append('metadataHeaders', 'Date');
  return gmailFetchJson<GmailThreadResource>({
    accessToken: params.accessToken,
    url: url.toString(),
    fetchImpl: params.fetchImpl,
  });
}

export async function listGmailThreads(params: {
  accessToken: string;
  label?: GmailLabelFilter;
  q?: string;
  pageToken?: string;
  maxResults?: number;
  fetchImpl?: typeof fetch;
}): Promise<GmailThreadListResult> {
  const maxResults = Math.min(Math.max(params.maxResults ?? MAX_RESULTS_CAP, 1), MAX_RESULTS_CAP);
  const label = params.label ?? 'INBOX';
  const listUrl = new URL(`${GMAIL_API}/threads`);
  listUrl.searchParams.set('maxResults', String(maxResults));
  listUrl.searchParams.set('labelIds', label);
  if (params.q?.trim()) listUrl.searchParams.set('q', params.q.trim());
  if (params.pageToken?.trim()) listUrl.searchParams.set('pageToken', params.pageToken.trim());

  const list = await gmailFetchJson<GmailThreadsListResponse>({
    accessToken: params.accessToken,
    url: listUrl.toString(),
    fetchImpl: params.fetchImpl,
  });

  const ids = (list.threads ?? []).map((t) => t.id).filter((id): id is string => Boolean(id));
  const threads: GmailThreadSummary[] = [];
  for (const id of ids) {
    const detail = await fetchThreadMetadata({
      accessToken: params.accessToken,
      threadId: id,
      fetchImpl: params.fetchImpl,
    });
    threads.push(summaryFromThread(detail));
  }

  return {
    threads,
    nextPageToken: list.nextPageToken ?? null,
    resultSizeEstimate: list.resultSizeEstimate ?? null,
  };
}

export async function getGmailThread(params: {
  accessToken: string;
  threadId: string;
  fetchImpl?: typeof fetch;
}): Promise<GmailThreadDetail> {
  const threadId = params.threadId.trim();
  if (!threadId) {
    throw new GmailClientError('threadId is required');
  }
  const url = new URL(`${GMAIL_API}/threads/${encodeURIComponent(threadId)}`);
  url.searchParams.set('format', 'full');
  const detail = await gmailFetchJson<GmailThreadResource>({
    accessToken: params.accessToken,
    url: url.toString(),
    fetchImpl: params.fetchImpl,
  });
  const messages = (detail.messages ?? []).map(mapMessage);
  const unread = (detail.messages ?? []).some((m) => (m.labelIds ?? []).includes('UNREAD'));
  const subject =
    messages.find((m) => m.subject)?.subject ||
    headerValue(detail.messages?.[0]?.payload?.headers, 'Subject') ||
    '(no subject)';
  return {
    id: detail.id ?? threadId,
    subject,
    snippet: detail.snippet ?? '',
    unread,
    messages,
  };
}
