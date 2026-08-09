import type {
  GmailLabelFilter,
  GmailThreadDetail,
  GmailThreadSummary,
} from '@/lib/google/gmailTypes';
import type { GmailDraftDetail, GmailDraftSummary } from '@/lib/google/gmailSend';
import { supabase } from '@/lib/supabase';

async function staffBearer(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

type GateFlags = {
  needsGmailReadonly?: boolean;
  needsGmailCompose?: boolean;
  needsConnect?: boolean;
  needsReconnect?: boolean;
};

function gateFromBody(body: GateFlags): GateFlags {
  return {
    needsGmailReadonly: body.needsGmailReadonly,
    needsGmailCompose: body.needsGmailCompose,
    needsConnect: body.needsConnect,
    needsReconnect: body.needsReconnect,
  };
}

export type ListGmailThreadsResult =
  | {
      ok: true;
      threads: GmailThreadSummary[];
      nextPageToken: string | null;
      label: GmailLabelFilter;
    }
  | ({ ok: false; error: string } & GateFlags);

export async function listGmailThreadsClient(params: {
  label?: GmailLabelFilter;
  q?: string;
  pageToken?: string;
}): Promise<ListGmailThreadsResult> {
  const token = await staffBearer();
  if (!token) return { ok: false, error: 'Not signed in' };

  const url = new URL('/api/staff/gmail/threads', window.location.origin);
  if (params.label) url.searchParams.set('label', params.label);
  if (params.q?.trim()) url.searchParams.set('q', params.q.trim());
  if (params.pageToken) url.searchParams.set('pageToken', params.pageToken);

  const res = await fetch(url.pathname + url.search, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as {
    ok?: boolean;
    threads?: GmailThreadSummary[];
    nextPageToken?: string | null;
    label?: GmailLabelFilter;
    error?: string;
  } & GateFlags;
  if (!res.ok || !body.ok || !body.threads) {
    return {
      ok: false,
      error: body.error ?? 'Failed to load Gmail threads',
      ...gateFromBody(body),
    };
  }
  return {
    ok: true,
    threads: body.threads,
    nextPageToken: body.nextPageToken ?? null,
    label: body.label ?? params.label ?? 'INBOX',
  };
}

export type GetGmailThreadResult =
  { ok: true; thread: GmailThreadDetail } | ({ ok: false; error: string } & GateFlags);

export async function getGmailThreadClient(threadId: string): Promise<GetGmailThreadResult> {
  const token = await staffBearer();
  if (!token) return { ok: false, error: 'Not signed in' };

  const res = await fetch(`/api/staff/gmail/threads/${encodeURIComponent(threadId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as {
    ok?: boolean;
    thread?: GmailThreadDetail;
    error?: string;
  } & GateFlags;
  if (!res.ok || !body.ok || !body.thread) {
    return {
      ok: false,
      error: body.error ?? 'Failed to load Gmail thread',
      ...gateFromBody(body),
    };
  }
  return { ok: true, thread: body.thread };
}

export type GmailMutationResult =
  { ok: true; messageId: string; threadId: string } | ({ ok: false; error: string } & GateFlags);

export async function sendGmailMessageClient(params: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyText: string;
}): Promise<GmailMutationResult> {
  const token = await staffBearer();
  if (!token) return { ok: false, error: 'Not signed in' };

  const res = await fetch('/api/staff/gmail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    messageId?: string;
    threadId?: string;
    error?: string;
  } & GateFlags;
  if (!res.ok || !body.ok || !body.messageId || !body.threadId) {
    return {
      ok: false,
      error: body.error ?? 'Failed to send message',
      ...gateFromBody(body),
    };
  }
  return { ok: true, messageId: body.messageId, threadId: body.threadId };
}

export async function replyGmailThreadClient(params: {
  threadId: string;
  mode: 'reply' | 'reply_all';
  bodyText: string;
  messageId?: string;
}): Promise<GmailMutationResult> {
  const token = await staffBearer();
  if (!token) return { ok: false, error: 'Not signed in' };

  const res = await fetch(`/api/staff/gmail/threads/${encodeURIComponent(params.threadId)}/reply`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mode: params.mode,
      bodyText: params.bodyText,
      messageId: params.messageId,
    }),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    messageId?: string;
    threadId?: string;
    error?: string;
  } & GateFlags;
  if (!res.ok || !body.ok || !body.messageId || !body.threadId) {
    return {
      ok: false,
      error: body.error ?? 'Failed to send reply',
      ...gateFromBody(body),
    };
  }
  return { ok: true, messageId: body.messageId, threadId: body.threadId };
}

export type GmailDraftResult =
  | { ok: true; draft: GmailDraftSummary | GmailDraftDetail }
  | ({ ok: false; error: string } & GateFlags);

export type ListGmailDraftsResult =
  | { ok: true; drafts: GmailDraftSummary[]; nextPageToken: string | null }
  | ({ ok: false; error: string } & GateFlags);

export async function listGmailDraftsClient(): Promise<ListGmailDraftsResult> {
  const token = await staffBearer();
  if (!token) return { ok: false, error: 'Not signed in' };

  const res = await fetch('/api/staff/gmail/drafts', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as {
    ok?: boolean;
    drafts?: GmailDraftSummary[];
    nextPageToken?: string | null;
    error?: string;
  } & GateFlags;
  if (!res.ok || !body.ok || !body.drafts) {
    return {
      ok: false,
      error: body.error ?? 'Failed to load drafts',
      ...gateFromBody(body),
    };
  }
  return {
    ok: true,
    drafts: body.drafts,
    nextPageToken: body.nextPageToken ?? null,
  };
}

export async function createGmailDraftClient(params: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyText: string;
  threadId?: string;
}): Promise<GmailDraftResult> {
  const token = await staffBearer();
  if (!token) return { ok: false, error: 'Not signed in' };

  const res = await fetch('/api/staff/gmail/drafts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    draft?: GmailDraftSummary;
    error?: string;
  } & GateFlags;
  if (!res.ok || !body.ok || !body.draft) {
    return {
      ok: false,
      error: body.error ?? 'Failed to save draft',
      ...gateFromBody(body),
    };
  }
  return { ok: true, draft: body.draft };
}

export async function getGmailDraftClient(draftId: string): Promise<GmailDraftResult> {
  const token = await staffBearer();
  if (!token) return { ok: false, error: 'Not signed in' };

  const res = await fetch(`/api/staff/gmail/drafts/${encodeURIComponent(draftId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as {
    ok?: boolean;
    draft?: GmailDraftDetail;
    error?: string;
  } & GateFlags;
  if (!res.ok || !body.ok || !body.draft) {
    return {
      ok: false,
      error: body.error ?? 'Failed to load draft',
      ...gateFromBody(body),
    };
  }
  return { ok: true, draft: body.draft };
}

export async function updateGmailDraftClient(params: {
  draftId: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyText: string;
  threadId?: string;
}): Promise<GmailDraftResult> {
  const token = await staffBearer();
  if (!token) return { ok: false, error: 'Not signed in' };

  const { draftId, ...fields } = params;
  const res = await fetch(`/api/staff/gmail/drafts/${encodeURIComponent(draftId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(fields),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    draft?: GmailDraftSummary;
    error?: string;
  } & GateFlags;
  if (!res.ok || !body.ok || !body.draft) {
    return {
      ok: false,
      error: body.error ?? 'Failed to update draft',
      ...gateFromBody(body),
    };
  }
  return { ok: true, draft: body.draft };
}

export async function sendGmailDraftClient(draftId: string): Promise<GmailMutationResult> {
  const token = await staffBearer();
  if (!token) return { ok: false, error: 'Not signed in' };

  const res = await fetch(`/api/staff/gmail/drafts/${encodeURIComponent(draftId)}/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as {
    ok?: boolean;
    messageId?: string;
    threadId?: string;
    error?: string;
  } & GateFlags;
  if (!res.ok || !body.ok || !body.messageId || !body.threadId) {
    return {
      ok: false,
      error: body.error ?? 'Failed to send draft',
      ...gateFromBody(body),
    };
  }
  return { ok: true, messageId: body.messageId, threadId: body.threadId };
}

export async function discardGmailDraftClient(
  draftId: string,
): Promise<{ ok: true } | ({ ok: false; error: string } & GateFlags)> {
  const token = await staffBearer();
  if (!token) return { ok: false, error: 'Not signed in' };

  const res = await fetch(`/api/staff/gmail/drafts/${encodeURIComponent(draftId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { ok?: boolean; error?: string } & GateFlags;
  if (!res.ok || !body.ok) {
    return {
      ok: false,
      error: body.error ?? 'Failed to discard draft',
      ...gateFromBody(body),
    };
  }
  return { ok: true };
}

export async function downloadGmailAttachmentClient(params: {
  messageId: string;
  attachmentId: string;
  filename: string;
}): Promise<{ ok: true } | ({ ok: false; error: string } & GateFlags)> {
  const token = await staffBearer();
  if (!token) return { ok: false, error: 'Not signed in' };

  const res = await fetch(
    `/api/staff/gmail/messages/${encodeURIComponent(params.messageId)}/attachments/${encodeURIComponent(params.attachmentId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    let error = 'Failed to download attachment';
    let flags: GateFlags = {};
    try {
      const body = (await res.json()) as { error?: string } & GateFlags;
      error = body.error ?? error;
      flags = gateFromBody(body);
    } catch {
      // binary error body
    }
    return { ok: false, error, ...flags };
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = params.filename || 'attachment';
  a.click();
  // Defer revoke so browsers that download asynchronously are not truncated.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { ok: true };
}
