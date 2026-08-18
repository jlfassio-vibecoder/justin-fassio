import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccountDetailDrawer } from '@/components/AccountDetailDrawer';
import { AccountOrderHistoryModal } from '@/components/AccountOrderHistoryModal';
import { AiUpdateResearchModal } from '@/components/AiUpdateResearchModal';
import { ImportAccountsModal } from '@/components/accountImport/ImportAccountsModal';
import { RetailerDirectory } from '@/components/directory/RetailerDirectory';
import { Button } from '@/components/ui/Button';
import { RowActionsMenu, type RowActionSection } from '@/components/ui/RowActionsMenu';
import { Tag } from '@/components/ui/Tag';
import { useAiAssist } from '@/hooks/useAiAssist';
import { useAuth } from '@/hooks/useAuth';
import { isApprovedOwner } from '@/lib/auth';
import {
  fetchAccountReorderSettingsForAccounts,
  upsertAccountReorderSettings,
  type AccountReorderSettingsRow,
} from '@/lib/accountReorderSettings';
import { buildApfDraft, buildAssistDraft, buildSuggestDraft } from '@/lib/aiAssistPrefill';
import { apparelSeasonLabel } from '@/lib/apparelSeasons';
import type { ProspectResearchMode } from '@/lib/fillBlankProspectFields';
import {
  groupOrdersByAccountId,
  lastOrderDate,
  latestSeason,
  totalLifetimeValueCad,
} from '@/lib/orderAggregates';
import { fetchOrdersForAccounts, type OrderRow } from '@/lib/orders';
import { computeReorderSuggestion, formatLocalIsoDate } from '@/lib/reorderCadence';
import type { Prospect } from '@/lib/prospects';
import { useOptionalLineContext } from '@/lib/lineContext';
import { BC_TERRITORY_CODE, type Territory } from '@/lib/territories';

interface ActiveAccountsTabProps {
  accounts: Prospect[];
  territories?: Territory[];
  onLogCall: (account: Prospect) => void;
  onNotesSaved?: (id: number, notes: string | null) => void;
  onProspectUpdated?: (prospect: Prospect) => void;
  deepLinkAccountId?: number | null;
  onDeepLinkConsumed?: () => void;
  deepLinkImport?: boolean;
  onImportDeepLinkConsumed?: () => void;
  onImported?: () => void;
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

export function ActiveAccountsTab({
  accounts,
  territories = [],
  onLogCall,
  onNotesSaved,
  onProspectUpdated,
  deepLinkAccountId = null,
  onDeepLinkConsumed,
  deepLinkImport = false,
  onImportDeepLinkConsumed,
  onImported,
}: ActiveAccountsTabProps) {
  const { openAssist } = useAiAssist();
  const { profile } = useAuth();
  const lineCtx = useOptionalLineContext();
  const prefillLine = { multiLineAi: lineCtx.multiLineAi, lineName: lineCtx.name };
  const salesLineId = lineCtx.multiLineUi ? lineCtx.salesLineId : null;
  const [territoryCode, setTerritoryCode] = useState(BC_TERRITORY_CODE);
  const [ordersByAccount, setOrdersByAccount] = useState<Map<number, OrderRow[]>>(new Map());
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [aiResearch, setAiResearch] = useState<{
    account: Prospect;
    mode: ProspectResearchMode;
  } | null>(null);
  const [historyAccount, setHistoryAccount] = useState<Prospect | null>(null);
  const [detailAccount, setDetailAccount] = useState<Prospect | null>(null);
  const [ordersReloadToken, setOrdersReloadToken] = useState(0);
  const [settingsByAccount, setSettingsByAccount] = useState<
    Map<number, AccountReorderSettingsRow>
  >(new Map());
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsReloadToken, setSettingsReloadToken] = useState(0);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [appliedDeepLinkAccountId, setAppliedDeepLinkAccountId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // Copilot suggestion ignored: useEffect setState fails react-hooks/set-state-in-effect; render-time prop sync is the React-supported pattern.
  if (deepLinkAccountId != null && deepLinkAccountId !== appliedDeepLinkAccountId) {
    const match = accounts.find((a) => a.id === deepLinkAccountId);
    setAppliedDeepLinkAccountId(deepLinkAccountId);
    if (match) setDetailAccount(match);
    queueMicrotask(() => onDeepLinkConsumed?.());
  }

  if (deepLinkImport && !importOpen) {
    setImportOpen(true);
    queueMicrotask(() => onImportDeepLinkConsumed?.());
  }

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
      const result = await fetchOrdersForAccounts(ids, salesLineId ? { salesLineId } : {});
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
  }, [accountIdsKey, ordersReloadToken, salesLineId]);

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

    const results = await Promise.allSettled(
      accounts.map(async (account) => {
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
          throw new Error(`${account.name}: ${result.error}`);
        }
      }),
    );

    const failures = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));

    setRefreshBusy(false);
    if (failures.length > 0) {
      setRefreshError(failures.join(' · '));
    }
    reloadSettings();
  }

  function renderAiReminder(account: Prospect) {
    const settings = settingsByAccount.get(account.id);
    if (!isContactDue(settings?.next_suggested_contact_date, todayIso)) {
      return null;
    }
    const notes = settings?.ai_reorder_notes?.trim() || undefined;
    return (
      <Tag
        variant="accent"
        title={notes ?? 'AI Suggested Reorder Contact'}
        aria-label={notes ?? 'AI Suggested Reorder Contact'}
        className="max-w-full truncate text-[10px]"
      >
        Reorder due
      </Tag>
    );
  }

  return (
    <>
      <RetailerDirectory
        data-screen-label="accounts"
        retailers={accounts}
        territories={territories}
        territoryCode={territoryCode}
        onTerritoryCodeChange={setTerritoryCode}
        currentSalesLineId={salesLineId}
        searchPlaceholder="Search active accounts by name, city, address, or fit…"
        emptyMessage="No active accounts yet. Convert a prospect after a Closed PO or from Details."
        extraColumnHeaders={['TLV', 'Last order', 'Season']}
        toolbarExtra={
          <div className="flex items-center gap-2">
            {isApprovedOwner(profile) ? (
              <Button
                variant="secondary"
                className="text-xs whitespace-nowrap"
                onClick={() => setImportOpen(true)}
              >
                Import accounts
              </Button>
            ) : null}
            {accounts.length > 0 ? (
              <Button
                variant="secondary"
                className="text-xs whitespace-nowrap"
                disabled={refreshBusy}
                onClick={() => void handleRefreshAiReminders()}
              >
                {refreshBusy ? 'Refreshing…' : 'Refresh AI reminders'}
              </Button>
            ) : null}
          </div>
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
        renderActions={(account) => {
          const chips = { prospectId: account.id, prospectName: account.name };
          const sections: RowActionSection[] = [
            {
              id: 'account',
              label: 'Account',
              items: [
                {
                  id: 'open',
                  label: 'Open account',
                  onSelect: () => setDetailAccount(account),
                },
                {
                  id: 'log-call',
                  label: 'Log call',
                  onSelect: () => onLogCall(account),
                },
                {
                  id: 'log-order',
                  label: 'Log order / reorder',
                  onSelect: () => setHistoryAccount(account),
                },
              ],
            },
            {
              id: 'ai',
              label: 'AI tools',
              items: [
                {
                  id: 'verify',
                  label: 'Verify & Update',
                  onSelect: () => setAiResearch({ account, mode: 'update' }),
                },
                {
                  id: 'fill-blanks',
                  label: 'Fill Blank Fields',
                  onSelect: () => setAiResearch({ account, mode: 'fill-blanks' }),
                },
                {
                  id: 'suggest',
                  label: 'Recommend Next Action',
                  onSelect: () =>
                    openAssist({ chips, draft: buildSuggestDraft(chips, prefillLine) }),
                },
                {
                  id: 'brief',
                  label: 'Generate Account Brief',
                  onSelect: () => openAssist({ chips, draft: buildApfDraft(chips, prefillLine) }),
                },
                {
                  id: 'ask',
                  label: 'Ask AI About Account',
                  onSelect: () =>
                    openAssist({ chips, draft: buildAssistDraft(chips, prefillLine) }),
                },
              ],
            },
          ];
          return (
            <>
              {renderAiReminder(account)}
              <div className="flex items-center justify-end gap-1.5">
                <Button
                  variant="secondary"
                  className="px-3 py-1 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onLogCall(account);
                  }}
                >
                  Log Call
                </Button>
                <RowActionsMenu label={`Actions for ${account.name}`} sections={sections} />
              </div>
            </>
          );
        }}
      />

      <ImportAccountsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={onImported}
      />

      <AiUpdateResearchModal
        open={aiResearch != null}
        prospect={aiResearch?.account ?? null}
        mode={aiResearch?.mode ?? 'update'}
        onClose={() => setAiResearch(null)}
        onApplied={(prospect) => {
          onProspectUpdated?.(prospect);
          if (detailAccount?.id === prospect.id) {
            setDetailAccount(prospect);
          }
        }}
      />

      <AccountDetailDrawer
        account={detailAccount}
        summary={
          detailAccount
            ? {
                tlvCad: totalLifetimeValueCad(ordersByAccount.get(detailAccount.id) ?? []),
                lastOrderDate: lastOrderDate(ordersByAccount.get(detailAccount.id) ?? []),
                latestSeason: latestSeason(ordersByAccount.get(detailAccount.id) ?? []),
              }
            : null
        }
        reorderSettings={detailAccount ? (settingsByAccount.get(detailAccount.id) ?? null) : null}
        onClose={() => setDetailAccount(null)}
        onLogCall={onLogCall}
        onLogOrder={(account) => setHistoryAccount(account)}
        onNotesSaved={(notes) => {
          if (!detailAccount) return;
          setDetailAccount({ ...detailAccount, notes });
          onNotesSaved?.(detailAccount.id, notes);
        }}
        onDemoted={(prospect) => {
          onProspectUpdated?.(prospect);
          setDetailAccount(null);
        }}
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
