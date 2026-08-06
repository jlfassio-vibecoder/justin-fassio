import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_SILENCE_MS } from '@/lib/chatWittyLines';

const generateTextMock = vi.fn();

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: vi.fn() };
  },
}));

vi.mock('@/lib/supabaseAdmin', () => ({
  getServiceRoleClient: () => null,
}));

import { generateAiChatReply, insertVisitorMessage, runSilenceCheck } from '@/lib/liveChat';

function createThreadAdmin(opts: {
  chatState: string;
  awaitingReplySince: string | null;
  userId?: string;
}) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const userId = opts.userId ?? 'user-1';

  const from = vi.fn(() => {
    const api: Record<string, unknown> = {};
    const self = () => api;
    api.select = vi.fn(self);
    api.eq = vi.fn(self);
    api.order = vi.fn(self);
    api.limit = vi.fn(self);
    api.maybeSingle = vi.fn(async () => ({
      data: {
        id: 'thread-1',
        visitor_user_id: userId,
        chat_state: opts.chatState,
        awaiting_reply_since: opts.awaitingReplySince,
        visitor_name: 'Sam',
      },
      error: null,
    }));
    api.insert = vi.fn((payload: unknown) => {
      inserts.push(payload);
      return Promise.resolve({ error: null });
    });
    api.update = vi.fn((payload: unknown) => {
      updates.push(payload);
      return {
        eq: () => ({
          eq: () => Promise.resolve({ error: null }),
          then: (onFulfilled: (v: unknown) => unknown) =>
            Promise.resolve({ error: null }).then(onFulfilled),
        }),
      };
    });
    return api;
  });

  return { from, inserts, updates } as unknown as {
    from: typeof from;
    inserts: unknown[];
    updates: unknown[];
  };
}

describe('runSilenceCheck', () => {
  it('no-ops before the silence window', async () => {
    const admin = createThreadAdmin({
      chatState: 'awaiting_human',
      awaitingReplySince: new Date().toISOString(),
    });
    const result = await runSilenceCheck(admin as never, {
      threadId: 'thread-1',
      userId: 'user-1',
    });
    expect(result).toEqual({ ok: true, inserted: false, chatState: 'awaiting_human' });
    expect(admin.inserts).toHaveLength(0);
  });

  it('inserts a witty line after silence', async () => {
    const admin = createThreadAdmin({
      chatState: 'awaiting_human',
      awaitingReplySince: new Date(Date.now() - CHAT_SILENCE_MS - 1000).toISOString(),
    });
    const result = await runSilenceCheck(admin as never, {
      threadId: 'thread-1',
      userId: 'user-1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.inserted).toBe(true);
      expect(result.chatState).toBe('ai_active');
      expect(result.wittyLine).toBeTruthy();
    }
    expect(admin.inserts.length).toBeGreaterThan(0);
  });

  it('is idempotent once AI is already active', async () => {
    const admin = createThreadAdmin({
      chatState: 'ai_active',
      awaitingReplySince: new Date(Date.now() - CHAT_SILENCE_MS - 1000).toISOString(),
    });
    const result = await runSilenceCheck(admin as never, {
      threadId: 'thread-1',
      userId: 'user-1',
    });
    expect(result).toEqual({ ok: true, inserted: false, chatState: 'ai_active' });
    expect(admin.inserts).toHaveLength(0);
  });

  it('rejects other visitors', async () => {
    const admin = createThreadAdmin({
      chatState: 'awaiting_human',
      awaitingReplySince: new Date(Date.now() - CHAT_SILENCE_MS - 1000).toISOString(),
      userId: 'owner-1',
    });
    const result = await runSilenceCheck(admin as never, {
      threadId: 'thread-1',
      userId: 'intruder-2',
    });
    expect(result).toEqual({ ok: false, error: 'Thread not found' });
  });
});

describe('insertVisitorMessage', () => {
  it('rejects other visitors', async () => {
    const admin = createThreadAdmin({
      chatState: 'awaiting_human',
      awaitingReplySince: null,
      userId: 'owner-1',
    });
    const result = await insertVisitorMessage(admin as never, {
      threadId: 'thread-1',
      userId: 'intruder-2',
      body: 'Hello',
    });
    expect(result).toEqual({ ok: false, error: 'Thread not found' });
  });
});

describe('generateAiChatReply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses when Justin has taken over', async () => {
    const admin = createThreadAdmin({
      chatState: 'human_active',
      awaitingReplySince: null,
    });

    const result = await generateAiChatReply(admin as never, {
      threadId: 'thread-1',
      userId: 'user-1',
    });
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(generateTextMock).not.toHaveBeenCalled();
  });
});
