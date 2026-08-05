import { useCallback, useEffect, useState } from 'react';
import { AccountDetailDrawer } from '@/components/AccountDetailDrawer';
import { AccountOrderHistoryModal } from '@/components/AccountOrderHistoryModal';
import { MessageThreadPanel } from '@/components/messages/MessageThreadPanel';
import { MessagesThreadList } from '@/components/messages/MessagesThreadList';
import { ProspectDetailDrawer } from '@/components/ProspectDetailDrawer';
import { cn } from '@/lib/cn';
import {
  fetchMessageThreads,
  fetchNeedsMappingCount,
  fetchProspectById,
  type MessageThread,
  type MessageThreadFilter,
} from '@/lib/messages';
import { fetchOrdersForAccounts, type OrderRow } from '@/lib/orders';
import type { Prospect } from '@/lib/prospects';

const FILTERS: { key: MessageThreadFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'needs_mapping', label: 'Needs mapping' },
  { key: 'confirmed', label: 'Confirmed' },
];

interface MessagesTabProps {
  reloadToken?: number;
  onNeedsMappingCountChange?: (count: number) => void;
  onLogCall: (prospect: Prospect) => void;
  onNotesSaved?: (id: number, notes: string | null) => void;
}

export function MessagesTab({
  reloadToken = 0,
  onNeedsMappingCountChange,
  onLogCall,
  onNotesSaved,
}: MessagesTabProps) {
  const [filter, setFilter] = useState<MessageThreadFilter>('all');
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
      const result = await fetchMessageThreads({ filter });
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
        const badge = await fetchNeedsMappingCount();
        if (!active) return;
        onNeedsMappingCountChange(badge.count);
      }
    })();

    return () => {
      active = false;
    };
  }, [filter, reloadToken, listReloadToken, onNeedsMappingCountChange]);

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

  return (
    <section data-screen-label="messages" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading m-0 text-2xl">Messages</h2>
          <p className="text-ink/65 m-0 mt-1 text-sm">
            Inbound wholesale order requests. Confirm the account map so threads show on prospect
            and account drawers.
          </p>
        </div>
        <div className="bg-surface flex items-center gap-1 rounded-full p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => {
                setLoading(true);
                setFilter(f.key);
              }}
              className={cn(
                'font-heading rounded-full px-3.5 py-1.5 text-sm',
                filter === f.key ? 'bg-accent text-bg' : 'text-ink/70 bg-transparent',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <p className="text-ink/60 m-0 text-sm">Loading threads…</p> : null}
      {error ? (
        <p className="text-accent-800 m-0 text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {openMappedError ? (
        <p className="text-accent-800 m-0 text-sm" role="alert">
          {openMappedError}
        </p>
      ) : null}

      {!loading && !error ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <MessagesThreadList
            threads={threads}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            onOpenMapped={(thread) => {
              void openMapped(thread);
            }}
            emptyMessage={
              filter === 'needs_mapping'
                ? 'No threads need mapping.'
                : filter === 'confirmed'
                  ? 'No confirmed threads yet.'
                  : 'No wholesale messages yet. New order requests appear here.'
            }
          />
          <div className="border-ink/10 bg-surface min-h-[20rem] rounded-md border p-4">
            {selected ? (
              <MessageThreadPanel
                key={selected.id}
                thread={selected}
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
