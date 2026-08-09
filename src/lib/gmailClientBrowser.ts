import type {
  GmailLabelFilter,
  GmailThreadDetail,
  GmailThreadSummary,
} from '@/lib/google/gmailTypes';
import { supabase } from '@/lib/supabase';

async function staffBearer(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export type ListGmailThreadsResult =
  | {
      ok: true;
      threads: GmailThreadSummary[];
      nextPageToken: string | null;
      label: GmailLabelFilter;
    }
  | { ok: false; error: string; needsGmailReadonly?: boolean; needsConnect?: boolean };

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
    needsGmailReadonly?: boolean;
    needsConnect?: boolean;
  };
  if (!res.ok || !body.ok || !body.threads) {
    return {
      ok: false,
      error: body.error ?? 'Failed to load Gmail threads',
      needsGmailReadonly: body.needsGmailReadonly,
      needsConnect: body.needsConnect,
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
  | { ok: true; thread: GmailThreadDetail }
  | { ok: false; error: string; needsGmailReadonly?: boolean; needsConnect?: boolean };

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
    needsGmailReadonly?: boolean;
    needsConnect?: boolean;
  };
  if (!res.ok || !body.ok || !body.thread) {
    return {
      ok: false,
      error: body.error ?? 'Failed to load Gmail thread',
      needsGmailReadonly: body.needsGmailReadonly,
      needsConnect: body.needsConnect,
    };
  }
  return { ok: true, thread: body.thread };
}
