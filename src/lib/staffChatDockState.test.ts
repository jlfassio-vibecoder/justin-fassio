import { describe, expect, it } from 'vitest';
import {
  enforceExpandedLimit,
  isLiveChatNeedingAttention,
  upsertIncomingLiveChat,
  upsertOpenLiveChat,
  type OpenLiveChatSlot,
} from '@/lib/staffChatDockState';
import type { MessageThread } from '@/lib/messages';

function thread(
  id: string,
  name = id,
  chatState: MessageThread['chatState'] = 'awaiting_human',
): MessageThread {
  return {
    id,
    prospectId: null,
    mappingStatus: 'unmapped',
    identityFingerprint: id,
    confirmedFingerprint: null,
    source: 'live-chat-fab',
    subject: `Live chat · ${name}`,
    channel: 'live_chat',
    chatState,
    visitorUserId: null,
    visitorName: name,
    visitorEmail: null,
    awaitingReplySince: null,
    lastMessageAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('staff chat dock helpers', () => {
  it('opens a new live chat slot expanded', () => {
    const next = upsertOpenLiveChat([], thread('a', 'Ada'));
    expect(next).toHaveLength(1);
    expect(next[0]?.minimized).toBe(false);
    expect(next[0]?.unread).toBe(0);
  });

  it('re-opens an existing chat and clears unread', () => {
    const slots: OpenLiveChatSlot[] = [{ thread: thread('a'), minimized: true, unread: 2 }];
    const next = upsertOpenLiveChat(slots, thread('a', 'Ada'));
    expect(next).toHaveLength(1);
    expect(next[0]?.minimized).toBe(false);
    expect(next[0]?.unread).toBe(0);
  });

  it('minimizes older windows when expanded limit is exceeded', () => {
    const slots: OpenLiveChatSlot[] = [
      { thread: thread('a'), minimized: false, unread: 0 },
      { thread: thread('b'), minimized: false, unread: 0 },
      { thread: thread('c'), minimized: false, unread: 0 },
      { thread: thread('d'), minimized: false, unread: 0 },
    ];
    const next = enforceExpandedLimit(slots, 3);
    const expanded = next.filter((s) => !s.minimized).map((s) => s.thread.id);
    expect(expanded).toEqual(['b', 'c', 'd']);
    expect(next.find((s) => s.thread.id === 'a')?.minimized).toBe(true);
  });

  it('surfaces incoming chats as minimized with unread', () => {
    const next = upsertIncomingLiveChat([], thread('a', 'Ada'));
    expect(next[0]?.minimized).toBe(true);
    expect(next[0]?.unread).toBe(1);
    expect(isLiveChatNeedingAttention(thread('a'))).toBe(true);
  });

  it('bumps unread when an incoming message hits a minimized slot', () => {
    const slots: OpenLiveChatSlot[] = [{ thread: thread('a'), minimized: true, unread: 1 }];
    const next = upsertIncomingLiveChat(slots, thread('a', 'Ada'));
    expect(next[0]?.unread).toBe(2);
    expect(next[0]?.minimized).toBe(true);
  });
});
