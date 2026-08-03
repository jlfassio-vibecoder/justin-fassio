import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccountOrderHistoryModal } from '@/components/AccountOrderHistoryModal';
import { RetailerDirectory } from '@/components/directory/RetailerDirectory';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import {
  fetchAccountReorderSettingsForAccounts,
  upsertAccountReorderSettings,
  type AccountReorderSettingsRow,
} from '@/lib/accountReorderSettings';
import { apparelSeasonLabel } from '@/lib/apparelSeasons';
import {
  groupOrdersByAccountId,
  lastOrderDate,
  latestSeason,
  totalLifetimeValueCad,
} from '@/lib/orderAggregates';
import { fetchOrdersForAccounts, type OrderRow } from '@/lib/orders';
import { computeReorderSuggestion, formatLocalIsoDate } from '@/lib/reorderCadence';
import type { Prospect } from '@/lib/prospects';

interface ActiveAccountsTabProps {
  accounts: Prospect[];
  onLogCall: (account: Prospect) => void;
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

function isContactDue(isoDate: string | null | undefined, todayIso: string): boolean {
  if (!isoDate) return false;
  return isoDate <= todayIso;
}

export function ActiveAccountsTab({ accounts, onLogCall }: ActiveAccountsTabProps) {
  const [ordersByAccount, setOrdersByAccount] = useState<Map<number, OrderRow[]>>(new Map());
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [historyAccount, setHistoryAccount] = useState<Prospect | null>(null);
  const [ordersReloadToken, setOrdersReloadToken] = useState(0);
  const [settingsByAccount, setSettingsByAccount] = useState<
    Map<number, AccountReorderSettingsRow>
  >(new Map());
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsReloadToken, setSettingsReloadToken] = useState(0);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const todayIso = formatLocalIsoDate(new Date());

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

  const reloadSettings = useCallback(() => {
    setSettingsReloadToken((n) => n + 1);
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

  useEffect(() => {
    let active = true;
    const ids = accountIdsKey === '' ? [] : accountIdsKey.split(',').map((s) => Number(s));

    async function loadSettings() {
      if (ids.length === 0) {
        setSettingsByAccount(new Map());
        setSettingsError(null);
        return;
      }

      const result = await fetchAccountReorderSettingsForAccounts(ids);
      if (!active) return;
      if (result.error) {
        setSettingsByAccount(new Map());
        setSettingsError(result.error);
        return;
      }
      const map = new Map<number, AccountReorderSettingsRow>();
      for (const row of result.data) {
        map.set(row.account_id, row);
      }
      setSettingsByAccount(map);
      setSettingsError(null);
    }

    void loadSettings();
    return () => {
      active = false;
    };
  }, [accountIdsKey, settingsReloadToken]);

  async function handleRefreshAiReminders() {
    setRefreshBusy(true);
    setRefreshError(null);

    for (const account of accounts) {
      const orders = ordersByAccount.get(account.id) ?? [];
      const existing = settingsByAccount.get(account.id);
      const lastOrder = lastOrderDate(orders) ?? existing?.last_order_date ?? null;
      const season = latestSeason(orders);
      const suggestion = computeReorderSuggestion({
        lastOrderDate: lastOrder,
        lastSeason: season,
        accountName: account.name,
      });

      const result = await upsertAccountReorderSettings({
        account_id: account.id,
        last_order_date: lastOrder,
        next_suggested_contact_date: suggestion.nextSuggestedContactDate,
        seasonal_cadence_tags: suggestion.seasonalCadenceTags,
        ai_reorder_notes: suggestion.aiReorderNotes,
      });

      if (result.error) {
        setRefreshBusy(false);
        setRefreshError(`${account.name}: ${result.error}`);
        return;
      }
    }

    setRefreshBusy(false);
    reloadSettings();
  }

  function renderAiReminder(account: Prospect) {
    const settings = settingsByAccount.get(account.id);
    if (!isContactDue(settings?.next_suggested_contact_date, todayIso)) {
      return null;
    }
    const notes = settings?.ai_reorder_notes?.trim() || undefined;
    return (
      <Tag variant="accent" title={notes} aria-label={notes ?? 'AI Suggested Reorder Contact'}>
        AI Suggested Reorder Contact
      </Tag>
    );
  }

  return (
    <>
      <RetailerDirectory
        data-screen-label="accounts"
        retailers={accounts}
        searchPlaceholder="Search active accounts by name, city, address, or fit…"
        emptyMessage="No active accounts yet. Convert a prospect after a Closed PO or from Details."
        extraColumnHeaders={['TLV', 'Last order', 'Season']}
        toolbarExtra={
          accounts.length > 0 ? (
            <Button
              variant="secondary"
              className="text-xs whitespace-nowrap"
              disabled={refreshBusy}
              onClick={() => void handleRefreshAiReminders()}
            >
              {refreshBusy ? 'Refreshing…' : 'Refresh AI reminders'}
            </Button>
          ) : null
        }
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
            {settingsError ? (
              <p className="text-sm text-red-700" role="alert">
                Could not load reorder settings: {settingsError}
              </p>
            ) : null}
            {refreshError ? (
              <p className="text-sm text-red-700" role="alert">
                Could not refresh AI reminders: {refreshError}
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
            {renderAiReminder(account)}
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
        onOrderSaved={() => {
          reloadOrders();
          reloadSettings();
        }}
      />
    </>
  );
}
