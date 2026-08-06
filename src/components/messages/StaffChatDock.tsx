import { StaffLiveChatWindow } from '@/components/messages/StaffLiveChatWindow';
import { enforceExpandedLimit, type OpenLiveChatSlot } from '@/lib/staffChatDockState';
import type { MessageThread } from '@/lib/messages';

interface StaffChatDockProps {
  openChats: OpenLiveChatSlot[];
  onChange: (next: OpenLiveChatSlot[]) => void;
  onReplySent?: (thread: MessageThread) => void;
}

export function StaffChatDock({ openChats, onChange, onReplySent }: StaffChatDockProps) {
  if (openChats.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-3 bottom-3 z-[45] flex flex-row-reverse flex-wrap-reverse items-end justify-end gap-3 sm:right-5 sm:bottom-5"
      aria-label="Open live chats"
    >
      {openChats.map((slot) => (
        <StaffLiveChatWindow
          key={slot.thread.id}
          thread={slot.thread}
          minimized={slot.minimized}
          unread={slot.unread}
          onMinimize={() =>
            onChange(
              openChats.map((s) =>
                s.thread.id === slot.thread.id ? { ...s, minimized: true } : s,
              ),
            )
          }
          onExpand={() =>
            onChange(
              enforceExpandedLimit(
                openChats.map((s) =>
                  s.thread.id === slot.thread.id ? { ...s, minimized: false, unread: 0 } : s,
                ),
              ),
            )
          }
          onClose={() => onChange(openChats.filter((s) => s.thread.id !== slot.thread.id))}
          onVisitorMessageWhileMinimized={() =>
            onChange(
              openChats.map((s) =>
                s.thread.id === slot.thread.id ? { ...s, unread: s.unread + 1 } : s,
              ),
            )
          }
          onReplySent={(thread) => {
            onChange(openChats.map((s) => (s.thread.id === thread.id ? { ...s, thread } : s)));
            onReplySent?.(thread);
          }}
        />
      ))}
    </div>
  );
}
