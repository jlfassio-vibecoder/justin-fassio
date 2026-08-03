import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccountOrderHistoryModal } from '@/components/AccountOrderHistoryModal';
import { RetailerDirectory } from '@/components/directory/RetailerDirectory';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { apparelSeasonLabel } from '@/lib/apparelSeasons';
import {
  groupOrdersByAccountId,
  lastOrderDate,
  latestSeason,
  totalLifetimeValueCad,
} from '@/lib/orderAggregates';
import { fetchOrdersForAccounts, type OrderRow } from '@/lib/orders';
import type { Prospect } from '@/lib/prospects';

interface ActiveAccountsTabProps {
  accounts: Prospect[];
  onLogCall: (account: Prospect) => void;
  /** Reserved for Phase V AI reorder badge. Defaults to null (no fake due badges). */
  renderAiReminder?: (account: Prospect) => ReactNode;
}

function formatCad(amount: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(isoDate: string | null): string {
  if (!isoDate) return '—';
  return isoDate;
}

export function ActiveAccountsTab({
  accounts,
  onLogCall,
  renderAiReminder,
}: ActiveAccountsTabProps) {
  const [ordersByAccount, setOrdersByAccount] = useState<Map<number, OrderRow[]>>(new Map());
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [historyAccount, setHistoryAccount] = useState<Prospect | null>(null);
  const [ordersReloadToken, setOrdersReloadToken] = useState(0);

  const accountIdsKey = useMemo(
    () =>
      accounts
        .map((a) => a.id)
        .sort((a, b) => a - b)
        .join(','),
    [accounts],
  );

  const reloadOrders = useCallback(() => {
    setOrdersReloadToken((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    const ids = accountIdsKey === '' ? [] : accountIdsKey.split(',').map((s) => Number(s));

    async function load() {
      if (ids.length === 0) {
        setOrdersByAccount(new Map());
        setOrdersError(null);
        setOrdersLoading(false);
        return;
      }

      setOrdersLoading(true);
      setOrdersError(null);
      const result = await fetchOrdersForAccounts(ids);
      if (!active) return;
      setOrdersLoading(false);
      if (result.error) {
        setOrdersByAccount(new Map());
        setOrdersError(result.error);
        return;
      }
      setOrdersByAccount(groupOrdersByAccountId(result.data));
    }

    void load();
    return () => {
      active = false;
    };
  }, [accountIdsKey, ordersReloadToken]);

  return (
    <>
      <RetailerDirectory
        data-screen-label="accounts"
        retailers={accounts}
        searchPlaceholder="Search active accounts by name, city, address, or fit…"
        emptyMessage="No active accounts yet. Convert a prospect after a Closed PO or from Details."
        extraColumnHeaders={['TLV', 'Last order', 'Season']}
        banner={
          <>
            {ordersLoading ? (
              <p className="text-ink/60 m-0 text-sm">Loading order summaries…</p>
            ) : null}
            {ordersError ? (
              <p className="text-sm text-red-700" role="alert">
                Could not load orders: {ordersError}
              </p>
            ) : null}
          </>
        }
        renderExtraCells={(account) => {
          const orders = ordersByAccount.get(account.id) ?? [];
          const season = latestSeason(orders);
          return (
            <>
              <td className="border-ink/[0.08] border-b p-2 whitespace-nowrap">
                <Tag variant="accent">{formatCad(totalLifetimeValueCad(orders))}</Tag>
              </td>
              <td className="border-ink/[0.08] border-b p-2 whitespace-nowrap opacity-80">
                {formatDate(lastOrderDate(orders))}
              </td>
              <td className="border-ink/[0.08] border-b p-2 whitespace-nowrap">
                {season ? (
                  <Tag variant="neutral">{apparelSeasonLabel(season)}</Tag>
                ) : (
                  <span className="opacity-50">—</span>
                )}
              </td>
            </>
          );
        }}
        renderActions={(account) => (
          <>
            {renderAiReminder?.(account) ?? null}
            <Button
              variant="primary"
              className="px-3 py-1 text-xs"
              onClick={() => setHistoryAccount(account)}
            >
              + Log Order / Reorder
            </Button>
            <Button
              variant="secondary"
              className="px-3 py-1 text-xs"
              onClick={() => onLogCall(account)}
            >
              Log Call
            </Button>
          </>
        )}
      />

      <AccountOrderHistoryModal
        open={historyAccount != null}
        account={historyAccount}
        orders={historyAccount ? (ordersByAccount.get(historyAccount.id) ?? []) : []}
        onClose={() => setHistoryAccount(null)}
        onOrderSaved={reloadOrders}
      />
    </>
  );
}
