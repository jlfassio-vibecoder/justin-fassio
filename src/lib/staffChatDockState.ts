import type { MessageThread } from '@/lib/messages';

export type OpenLiveChatSlot = {
  thread: MessageThread;
  minimized: boolean;
  unread: number;
};

const MAX_EXPANDED_DESKTOP = 3;
const MAX_EXPANDED_MOBILE = 1;

export function maxExpandedWindows(): number {
  if (typeof window === 'undefined') return MAX_EXPANDED_DESKTOP;
  return window.matchMedia('(max-width: 640px)').matches
    ? MAX_EXPANDED_MOBILE
    : MAX_EXPANDED_DESKTOP;
}

/** Keep at most `limit` expanded windows; newest expansions win. */
export function enforceExpandedLimit(
  slots: OpenLiveChatSlot[],
  limit = maxExpandedWindows(),
): OpenLiveChatSlot[] {
  const expandedIds = slots.filter((s) => !s.minimized).map((s) => s.thread.id);
  if (expandedIds.length <= limit) return slots;
  const keep = new Set(expandedIds.slice(-limit));
  return slots.map((s) => (s.minimized || keep.has(s.thread.id) ? s : { ...s, minimized: true }));
}

export function upsertOpenLiveChat(
  slots: OpenLiveChatSlot[],
  thread: MessageThread,
): OpenLiveChatSlot[] {
  if (slots.some((s) => s.thread.id === thread.id)) {
    return enforceExpandedLimit(
      slots.map((s) => (s.thread.id === thread.id ? { thread, minimized: false, unread: 0 } : s)),
    );
  }
  return enforceExpandedLimit([...slots, { thread, minimized: false, unread: 0 }]);
}

/**
 * Surface an incoming live chat without forcing expand:
 * - existing minimized slot → bump unread
 * - existing expanded → refresh thread meta
 * - new → add minimized with unread
 */
export function upsertIncomingLiveChat(
  slots: OpenLiveChatSlot[],
  thread: MessageThread,
): OpenLiveChatSlot[] {
  const existing = slots.find((s) => s.thread.id === thread.id);
  if (existing) {
    return slots.map((s) =>
      s.thread.id === thread.id
        ? {
            thread,
            minimized: s.minimized,
            unread: s.minimized ? s.unread + 1 : 0,
          }
        : s,
    );
  }
  return enforceExpandedLimit([...slots, { thread, minimized: true, unread: 1 }]);
}

/** Threads Justin should see in the dock without hunting the inbox. */
export function isLiveChatNeedingAttention(thread: MessageThread, now = Date.now()): boolean {
  if (thread.channel !== 'live_chat') return false;
  if (thread.chatState === 'awaiting_human' || thread.chatState === 'ai_active') return true;
  if (thread.chatState !== 'human_active') return false;
  const last = new Date(thread.lastMessageAt).getTime();
  if (!Number.isFinite(last)) return false;
  // Keep recently active human chats visible (2h).
  return now - last < 2 * 60 * 60 * 1000;
}
