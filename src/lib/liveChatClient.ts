import { supabaseChat } from '@/lib/supabaseChat';
import type { ChatState } from '@/lib/liveChat';
import { CHAT_SILENCE_MS } from '@/lib/chatWittyLines';
import type { MessagePayload, MessageRow } from '@/lib/messages';
import { MESSAGE_SELECT } from '@/lib/messages';

const THREAD_STORAGE_KEY = 'jf-live-chat-thread';

export type StoredChatSession = {
  threadId: string;
  name: string;
  email: string;
  authEmail?: string;
  authPassword?: string;
};

export function loadStoredChatSession(): StoredChatSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(THREAD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredChatSession;
    if (!parsed?.threadId || !parsed.name) return null;
    return {
      ...parsed,
      email: typeof parsed.email === 'string' ? parsed.email : '',
    };
  } catch {
    return null;
  }
}

export function saveStoredChatSession(session: StoredChatSession): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THREAD_STORAGE_KEY, JSON.stringify(session));
}

async function bearerHeaders(): Promise<HeadersInit> {
  const { data } = await supabaseChat.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in to chat');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function ensureChatAuthSession(stored?: StoredChatSession | null): Promise<void> {
  const { data: existing } = await supabaseChat.auth.getSession();
  if (existing.session?.access_token) return;

  if (stored?.authEmail && stored.authPassword) {
    const { error } = await supabaseChat.auth.signInWithPassword({
      email: stored.authEmail,
      password: stored.authPassword,
    });
    if (!error) return;
  }

  // Prefer anonymous when the project allows it.
  const anon = await supabaseChat.auth.signInAnonymously();
  if (!anon.error && anon.data.session) return;
}

export async function openChatSession(
  name: string,
  email: string,
): Promise<{ threadId: string; chatState: ChatState }> {
  const stored = loadStoredChatSession();
  await ensureChatAuthSession(stored);

  const { data: sessionData } = await supabaseChat.auth.getSession();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (sessionData.session?.access_token) {
    headers.Authorization = `Bearer ${sessionData.session.access_token}`;
  }

  const res = await fetch('/api/chat/session', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, email }),
  });
  const payload = (await res.json()) as {
    ok?: boolean;
    error?: string;
    threadId?: string;
    chatState?: ChatState;
    credentials?: { email: string; password: string } | null;
  };
  if (!res.ok || !payload.ok || !payload.threadId) {
    const message =
      typeof payload.error === 'string' && payload.error.trim() && payload.error !== '{}'
        ? payload.error
        : 'Could not open chat';
    throw new Error(message);
  }

  if (payload.credentials) {
    const { error } = await supabaseChat.auth.signInWithPassword({
      email: payload.credentials.email,
      password: payload.credentials.password,
    });
    if (error) throw new Error(error.message);
  }

  saveStoredChatSession({
    threadId: payload.threadId,
    name,
    email,
    authEmail: payload.credentials?.email ?? stored?.authEmail,
    authPassword: payload.credentials?.password ?? stored?.authPassword,
  });
  return {
    threadId: payload.threadId,
    chatState: payload.chatState ?? 'awaiting_human',
  };
}

/** Rehydrate auth when returning to an existing stored thread. */
export async function resumeChatSession(): Promise<StoredChatSession | null> {
  const stored = loadStoredChatSession();
  if (!stored) return null;
  await ensureChatAuthSession(stored);
  const { data } = await supabaseChat.auth.getSession();
  if (!data.session && stored.authEmail && stored.authPassword) {
    await supabaseChat.auth.signInWithPassword({
      email: stored.authEmail,
      password: stored.authPassword,
    });
  }
  return stored;
}

export async function sendChatMessage(threadId: string, body: string): Promise<void> {
  const headers = await bearerHeaders();
  const res = await fetch('/api/chat/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({ threadId, body }),
  });
  const payload = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !payload.ok) {
    throw new Error(payload.error ?? 'Could not send message');
  }
}

export async function runChatSilenceCheck(
  threadId: string,
): Promise<{ inserted: boolean; chatState: ChatState; wittyLine: string | null }> {
  const headers = await bearerHeaders();
  const res = await fetch('/api/chat/silence-check', {
    method: 'POST',
    headers,
    body: JSON.stringify({ threadId }),
  });
  const payload = (await res.json()) as {
    ok?: boolean;
    error?: string;
    inserted?: boolean;
    chatState?: ChatState;
    wittyLine?: string | null;
  };
  if (!res.ok || !payload.ok) {
    throw new Error(payload.error ?? 'Silence check failed');
  }
  return {
    inserted: Boolean(payload.inserted),
    chatState: payload.chatState ?? 'awaiting_human',
    wittyLine: typeof payload.wittyLine === 'string' ? payload.wittyLine : null,
  };
}

export async function requestAiChatReply(threadId: string): Promise<void> {
  const headers = await bearerHeaders();
  const res = await fetch('/api/chat/ai-reply', {
    method: 'POST',
    headers,
    body: JSON.stringify({ threadId }),
  });
  const payload = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !payload.ok) {
    if (res.status === 409) return;
    throw new Error(payload.error ?? 'AI reply failed');
  }
}

export async function fetchChatMessages(threadId: string): Promise<{
  data: MessageRow[];
  error: string | null;
}> {
  const { data, error } = await supabaseChat
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) return { data: [], error: error.message };
  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      threadId: row.thread_id,
      kind: row.kind,
      wholesaleOrderRequestId: row.wholesale_order_request_id,
      body: row.body,
      payload: (row.payload ?? {}) as MessagePayload,
      createdAt: row.created_at,
    })),
    error: null,
  };
}

export async function sendStaffChatReply(threadId: string, body: string): Promise<void> {
  const { data } = await (await import('@/lib/supabase')).supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in');
  const res = await fetch('/api/chat/staff-reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ threadId, body }),
  });
  const payload = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !payload.ok) {
    throw new Error(payload.error ?? 'Could not send reply');
  }
}

export { CHAT_SILENCE_MS };
