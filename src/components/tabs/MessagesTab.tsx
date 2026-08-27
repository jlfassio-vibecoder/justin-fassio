import { useCallback, useEffect, useState } from 'react';
import { AccountDetailDrawer } from '@/components/AccountDetailDrawer';
import { AccountOrderHistoryModal } from '@/components/AccountOrderHistoryModal';
import { GmailEmailChannel } from '@/components/messages/GmailEmailChannel';
import { MessageThreadPanel } from '@/components/messages/MessageThreadPanel';
import { MessagesThreadList } from '@/components/messages/MessagesThreadList';
import { ProspectDetailDrawer } from '@/components/ProspectDetailDrawer';
import { cn } from '@/lib/cn';
import { useOptionalLineContext } from '@/lib/lineContext';
import {
  fetchMessageThreads,
  fetchNeedsMappingCount,
  fetchProspectById,
  type MessageChannelFilter,
  type MessageThread,
  type MessageThreadFilter,
} from '@/lib/messages';
import { fetchOrdersForAccounts, type OrderRow } from '@/lib/orders';
import type { Prospect } from '@/lib/prospects';

const MAPPING_FILTERS: { key: MessageThreadFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'needs_mapping', label: 'Needs mapping' },
  { key: 'confirmed', label: 'Confirmed' },
];

/** UI channel filter — `email` is Phase A Google connection (not a message_threads channel). */
type MessagesUiChannel = MessageChannelFilter | 'email';

const CHANNEL_FILTERS: { key: MessagesUiChannel; label: string }[] = [
  { key: 'all', label: 'All channels' },
  { key: 'email', label: 'Email' },
  { key: 'live_chat', label: 'Realtime' },
  { key: 'wholesale', label: 'Wholesale' },
];

interface MessagesTabProps {
  reloadToken?: number;
  onNeedsMappingCountChange?: (count: number) => void;
  onLogCall: (prospect: Prospect) => void;
  onNotesSaved?: (id: number, notes: string | null) => void;
  onProspectUpdated?: (prospect: Prospect) => void;
  onOpenLiveChat?: (thread: MessageThread) => void;
  onSurfaceLiveChatPill?: (thread: MessageThread) => void;
}

export function MessagesTab({
  reloadToken = 0,
  onNeedsMappingCountChange,
  onLogCall,
  onNotesSaved,
  onProspectUpdated,
  onOpenLiveChat,
  onSurfaceLiveChatPill,
}: MessagesTabProps) {
  const line = useOptionalLineContext();
  const salesLineId = line.multiLineUi ? line.salesLineId : null;
  const [filter, setFilter] = useState<MessageThreadFilter>('all');
  const [channel, setChannel] = useState<MessagesUiChannel>('all');
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selected, setSelected] = useState<MessageThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listReloadToken, setListReloadToken] = useState(0);
  const [detailStore, setDetailStore] = useState<Prospect | null>(null);
  const [historyAccount, setHistoryAccount] = useState<Prospect | null>(null);
  const [historyOrders, setHistoryOrders] = useState<OrderRow[]>([]);
  const [openMappedError, setOpenMappedError] = useState<string | null>(null);

  const closeDetails = useCallback(() => {
    setDetailStore(null);
  }, []);

  const openMapped = useCallback(async (thread: MessageThread) => {
    if (thread.prospectId == null) return;
    setOpenMappedError(null);
    const result = await fetchProspectById(thread.prospectId);
    if (result.error || !result.data) {
      setOpenMappedError(result.error ?? 'Could not load mapped account.');
      return;
    }
    setDetailStore(result.data);
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      if (channel === 'email') {
        setThreads([]);
        setSelected(null);
        setError(null);
        setLoading(false);
        if (onNeedsMappingCountChange) {
          const badge = await fetchNeedsMappingCount(salesLineId ? { salesLineId } : {});
          if (!active) return;
          onNeedsMappingCountChange(badge.count);
        }
        return;
      }

      const result = await fetchMessageThreads({
        filter,
        channel,
        salesLineId: salesLineId ?? undefined,
      });
      if (!active) return;
      if (result.error) {
        setThreads([]);
        setError(result.error);
        setLoading(false);
        return;
      }
      setThreads(result.data);
      setError(null);
      setLoading(false);
      setSelected((prev) => {
        if (!prev) return result.data[0] ?? null;
        return result.data.find((t) => t.id === prev.id) ?? result.data[0] ?? null;
      });

      if (onNeedsMappingCountChange) {
        const badge = await fetchNeedsMappingCount(salesLineId ? { salesLineId } : {});
        if (!active) return;
        onNeedsMappingCountChange(badge.count);
      }
    })();

    return () => {
      active = false;
    };
  }, [filter, channel, reloadToken, listReloadToken, onNeedsMappingCountChange, salesLineId]);

  useEffect(() => {
    if (!historyAccount) return;
    let active = true;
    void fetchOrdersForAccounts([historyAccount.id]).then((result) => {
      if (!active) return;
      setHistoryOrders(result.data);
    });
    return () => {
      active = false;
    };
  }, [historyAccount]);

  const isActiveAccount = detailStore?.accountStatus === 'active_account';

  const emptyMessage =
    channel === 'live_chat'
      ? 'No realtime chats yet.'
      : channel === 'wholesale'
        ? 'No wholesale contact form threads yet.'
        : filter === 'needs_mapping'
          ? 'No threads need mapping.'
          : filter === 'confirmed'
            ? 'No confirmed threads yet.'
            : 'No messages yet. Wholesale requests and live chats appear here.';

  return (
    <section data-screen-label="messages" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading m-0 text-2xl">Messages</h2>
          <p className="text-ink/65 m-0 mt-1 text-sm">
            Wholesale requests, live chat, and Google Workspace email connection. Open realtime
            chats in floating windows to reply while working other tabs. Confirm the account map so
            threads show on drawers.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="bg-surface flex items-center gap-1 rounded-full p-1">
            {CHANNEL_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setLoading(true);
                  setChannel(f.key);
                }}
                className={cn(
                  'font-heading rounded-full px-3.5 py-1.5 text-sm',
                  channel === f.key ? 'bg-accent text-on-accent' : 'text-ink/70 bg-transparent',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {channel !== 'email' ? (
            <div className="bg-surface flex items-center gap-1 rounded-full p-1">
              {MAPPING_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    setFilter(f.key);
                  }}
                  className={cn(
                    'font-heading rounded-full px-3.5 py-1.5 text-sm',
                    filter === f.key ? 'bg-accent text-on-accent' : 'text-ink/70 bg-transparent',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {channel === 'email' ? <GmailEmailChannel /> : null}

      {channel !== 'email' && loading ? (
        <p className="text-ink/60 m-0 text-sm">Loading threads…</p>
      ) : null}
      {channel !== 'email' && error ? (
        <p className="text-accent-800 m-0 text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {openMappedError ? (
        <p className="text-accent-800 m-0 text-sm" role="alert">
          {openMappedError}
        </p>
      ) : null}

      {channel !== 'email' && !loading && !error ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <MessagesThreadList
            threads={threads}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            onOpenLiveChat={onOpenLiveChat}
            onOpenMapped={(thread) => {
              void openMapped(thread);
            }}
            emptyMessage={emptyMessage}
          />
          <div className="border-ink/10 bg-surface min-h-[20rem] rounded-md border p-4">
            {selected ? (
              <MessageThreadPanel
                key={selected.id}
                thread={selected}
                onOpenLiveChat={onOpenLiveChat}
                onSurfaceLiveChatPill={onSurfaceLiveChatPill}
                onOpenMapped={(thread) => {
                  void openMapped(thread);
                }}
                onThreadUpdated={() => {
                  setLoading(true);
                  setListReloadToken((n) => n + 1);
                }}
              />
            ) : (
              <p className="text-ink/60 m-0 text-sm">Select a thread to view details.</p>
            )}
          </div>
        </div>
      ) : null}

      {isActiveAccount ? (
        <AccountDetailDrawer
          account={detailStore}
          onClose={closeDetails}
          onLogCall={(account) => {
            onLogCall(account);
            closeDetails();
          }}
          onLogOrder={(account) => {
            setHistoryAccount(account);
            closeDetails();
          }}
          onNotesSaved={(notes) => {
            if (!detailStore) return;
            setDetailStore({ ...detailStore, notes });
            onNotesSaved?.(detailStore.id, notes);
          }}
          onTaxonomySaved={(prospect) => {
            setDetailStore(prospect);
            onProspectUpdated?.(prospect);
          }}
          onIdentitySaved={(prospect) => {
            setDetailStore(prospect);
            onProspectUpdated?.(prospect);
          }}
        />
      ) : (
        <ProspectDetailDrawer
          prospect={detailStore}
          onClose={closeDetails}
          onLogCall={(prospect) => {
            onLogCall(prospect);
            closeDetails();
          }}
          onNotesSaved={(notes) => {
            if (!detailStore) return;
            setDetailStore({ ...detailStore, notes });
            onNotesSaved?.(detailStore.id, notes);
          }}
          onTaxonomySaved={(prospect) => {
            setDetailStore(prospect);
            onProspectUpdated?.(prospect);
          }}
          onIdentitySaved={(prospect) => {
            setDetailStore(prospect);
            onProspectUpdated?.(prospect);
          }}
        />
      )}

      <AccountOrderHistoryModal
        open={historyAccount != null}
        account={historyAccount}
        orders={historyOrders}
        onClose={() => setHistoryAccount(null)}
        onOrderSaved={() => {
          if (!historyAccount) return;
          void fetchOrdersForAccounts([historyAccount.id]).then((result) => {
            setHistoryOrders(result.data);
          });
        }}
      />
    </section>
  );
}
