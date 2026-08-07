import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { fetchMessageThread, fetchMessageThreads, type MessageThread } from '@/lib/messages';
import {
  isLiveChatNeedingAttention,
  loadDismissedLiveChatIds,
  upsertIncomingLiveChat,
  type OpenLiveChatSlot,
} from '@/lib/staffChatDockState';
import { supabase } from '@/lib/supabase';

/**
 * Seeds the dock with live chats that need attention and keeps it in sync
 * when visitors send messages (Messenger-style: chats appear without hunting Messages).
 */
export function useStaffLiveChatInbox(args: {
  setOpenLiveChats: Dispatch<SetStateAction<OpenLiveChatSlot[]>>;
  onInboxActivity?: () => void;
}) {
  const { setOpenLiveChats, onInboxActivity } = args;
  const onInboxActivityRef = useRef(onInboxActivity);
  useEffect(() => {
    onInboxActivityRef.current = onInboxActivity;
  }, [onInboxActivity]);

  useEffect(() => {
    let active = true;

    void (async () => {
      const result = await fetchMessageThreads({ channel: 'live_chat', limit: 40 });
      if (!active || result.error) return;
      const dismissedIds = loadDismissedLiveChatIds();
      const needing = result.data.filter((t) =>
        isLiveChatNeedingAttention(t, Date.now(), dismissedIds),
      );
      if (needing.length === 0) return;

      setOpenLiveChats((prev) => {
        let next = prev;
        for (const thread of needing) {
          if (next.some((s) => s.thread.id === thread.id)) {
            next = next.map((s) => (s.thread.id === thread.id ? { ...s, thread } : s));
            continue;
          }
          next = [
            ...next,
            {
              thread,
              minimized: true,
              unread:
                thread.chatState === 'awaiting_human' || thread.chatState === 'ai_active' ? 1 : 0,
            },
          ];
        }
        return next;
      });
    })();

    return () => {
      active = false;
    };
  }, [setOpenLiveChats]);

  useEffect(() => {
    const channel = supabase
      .channel('staff-live-chat-inbox')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: 'kind=eq.live_chat_visitor',
        },
        (payload) => {
          const row = payload.new as { thread_id?: string; kind?: string };
          const threadId = row.thread_id;
          if (!threadId) return;

          void (async () => {
            const result = await fetchMessageThread(threadId);
            if (result.error || !result.data || result.data.channel !== 'live_chat') return;
            setOpenLiveChats((prev) => upsertIncomingLiveChat(prev, result.data as MessageThread));
            onInboxActivityRef.current?.();
          })();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_threads',
          filter: 'channel=eq.live_chat',
        },
        (payload) => {
          const id = (payload.new as { id?: string }).id;
          if (!id) return;
          void (async () => {
            const result = await fetchMessageThread(id);
            if (result.error || !result.data) return;
            setOpenLiveChats((prev) => upsertIncomingLiveChat(prev, result.data as MessageThread));
            onInboxActivityRef.current?.();
          })();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [setOpenLiveChats]);
}
