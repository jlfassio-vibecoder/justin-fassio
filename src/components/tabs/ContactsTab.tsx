import { useCallback, useEffect, useMemo, useState } from 'react';
import { AddContactAiModal } from '@/components/AddContactAiModal';
import { AccountDetailDrawer } from '@/components/AccountDetailDrawer';
import { AccountOrderHistoryModal } from '@/components/AccountOrderHistoryModal';
import { ProspectDetailDrawer } from '@/components/ProspectDetailDrawer';
import { ContactsDirectory } from '@/components/directory/ContactsDirectory';
import { Button } from '@/components/ui/Button';
import type { ContactDirectoryRow } from '@/lib/accountContacts';
import { fetchOrdersForAccounts, type OrderRow } from '@/lib/orders';
import type { Prospect } from '@/lib/prospects';

interface ContactsTabProps {
  contacts: ContactDirectoryRow[];
  prospects: Prospect[];
  onLogCall: (prospect: Prospect) => void;
  onNotesSaved?: (id: number, notes: string | null) => void;
  onProspectUpdated?: (prospect: Prospect) => void;
  /** Reload directory contacts after drawer contact CRUD. */
  onReloadContacts?: () => void;
  onProspectCreated?: (prospect: Prospect) => void;
}

export function ContactsTab({
  contacts,
  prospects,
  onLogCall,
  onNotesSaved,
  onProspectUpdated,
  onReloadContacts,
  onProspectCreated,
}: ContactsTabProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [detailStore, setDetailStore] = useState<Prospect | null>(null);
  const [historyAccount, setHistoryAccount] = useState<Prospect | null>(null);
  const [historyOrders, setHistoryOrders] = useState<OrderRow[]>([]);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const prospectsById = useMemo(() => {
    const map = new Map<number, Prospect>();
    for (const p of prospects) map.set(p.id, p);
    return map;
  }, [prospects]);

  const closeDetails = useCallback(() => {
    setDetailStore(null);
    onReloadContacts?.();
  }, [onReloadContacts]);

  useEffect(() => {
    if (!successBanner) return;
    const timer = window.setTimeout(() => setSuccessBanner(null), 4000);
    return () => window.clearTimeout(timer);
  }, [successBanner]);

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

  function resolveStore(contact: ContactDirectoryRow): Prospect | null {
    return prospectsById.get(contact.accountId) ?? null;
  }

  const isActiveAccount = detailStore?.accountStatus === 'active_account';

  return (
    <>
      <ContactsDirectory
        data-screen-label="contacts"
        contacts={contacts}
        searchPlaceholder="Search contacts by name, email, phone, or store…"
        emptyMessage="No contacts match these filters. Add contacts from Prospect or Active Account details."
        toolbarExtra={
          <Button
            variant="secondary"
            className="text-xs whitespace-nowrap"
            onClick={() => setAddOpen(true)}
          >
            + Add via AI
          </Button>
        }
        renderActions={(contact) => {
          const store = resolveStore(contact);
          return (
            <>
              <Button
                variant="secondary"
                className="px-3 py-1 text-xs"
                disabled={!store}
                onClick={() => {
                  const next = resolveStore(contact);
                  if (next) setDetailStore(next);
                }}
              >
                Details
              </Button>
              <Button
                variant="secondary"
                className="px-3 py-1 text-xs"
                disabled={!store}
                onClick={() => {
                  if (store) onLogCall(store);
                }}
              >
                Log Call
              </Button>
            </>
          );
        }}
      />

      {successBanner ? (
        <p className="text-ink/80 m-0 text-sm" role="status">
          {successBanner}
        </p>
      ) : null}

      <AddContactAiModal
        open={addOpen}
        prospects={prospects}
        onClose={() => setAddOpen(false)}
        onCreated={({ prospect, contact }) => {
          onProspectCreated?.(prospect);
          onReloadContacts?.();
          setSuccessBanner(`Added ${contact.fullName} at ${prospect.name} (#${prospect.id})`);
        }}
      />

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
    </>
  );
}
