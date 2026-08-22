import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Tag } from '@/components/ui/Tag';
import { allowedOpsCodesForStore } from '@/lib/operationalTerritories/allowedOperationalTerritories';
import {
  fetchOperationalTerritories,
  type OperationalTerritoryOption,
} from '@/lib/operationalTerritories/fetchOperationalTerritories';
import type { OpsReviewListItem } from '@/lib/operationalTerritories/reviewHttp';
import {
  applyOpsTerritorySuggestion,
  assignOpsTerritory,
  fetchOpsTerritoryReviewList,
  leaveOpsTerritoryUnassigned,
} from '@/lib/operationalTerritories/reviewClient';
import { readLastLineSlug } from '@/lib/lineContextStorage';

const DETAIL_REASON_LABELS: Record<string, string> = {
  missing_assignment: 'Missing assignment',
  missing_zip_or_county: 'Missing ZIP or county',
  unresolved_geography: 'Unresolved geography',
  la_zip_unlisted: 'LA ZIP unlisted',
  coverage_gap: 'Coverage gap',
  store_not_eligible: 'Store not eligible',
  location_changed_unresolved: 'Location changed — unresolved',
  location_mismatch: 'Location mismatch',
  backfill: 'Backlog',
};

function suggestionLabel(item: OpsReviewListItem): string {
  const s = item.currentSuggestion;
  if (s.ok) return `${s.territoryCode} (${s.matchedBy})`;
  return `Unresolved: ${DETAIL_REASON_LABELS[s.reason] ?? s.reason}`;
}

function accountDetailsHref(prospectId: number): string {
  const slug = readLastLineSlug() ?? 'ogr';
  return `/app/lines/${slug}/prospects?prospectId=${prospectId}`;
}

export function OpsTerritoryReviewWorkspace({
  reloadToken = 0,
  onQueueChanged,
}: {
  reloadToken?: number;
  onQueueChanged?: () => void;
}) {
  const [items, setItems] = useState<OpsReviewListItem[]>([]);
  const [opsTerritories, setOpsTerritories] = useState<OperationalTerritoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [manualPick, setManualPick] = useState<Record<number, string>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [list, ops] = await Promise.all([
      fetchOpsTerritoryReviewList(),
      fetchOperationalTerritories(),
    ]);
    if (!list.ok) {
      setError(list.error);
      setItems([]);
    } else {
      setItems(list.items);
    }
    if (!ops.error) setOpsTerritories(ops.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [list, ops] = await Promise.all([
        fetchOpsTerritoryReviewList(),
        fetchOperationalTerritories(),
      ]);
      if (!active) return;
      if (!list.ok) {
        setError(list.error);
        setItems([]);
      } else {
        setItems(list.items);
        setError(null);
      }
      if (!ops.error) setOpsTerritories(ops.data);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [reloadToken]);

  const storeOptions = useMemo(() => {
    const codes = new Set(items.map((i) => i.prospect.territoryCode).filter(Boolean) as string[]);
    return [...codes].sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (storeFilter !== 'all' && item.prospect.territoryCode !== storeFilter) return false;
      if (!q) return true;
      const hay = [
        item.prospect.name,
        item.prospect.city,
        item.prospect.postalCode,
        item.prospect.territoryName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, search, storeFilter]);

  async function runAction(
    prospectId: number,
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setBusyId(prospectId);
    setStatusMessage(null);
    const result = await action();
    setBusyId(null);
    if (!result.ok) {
      setStatusMessage(result.error ?? 'Action failed');
      return;
    }
    setStatusMessage(null);
    onQueueChanged?.();
    await load();
  }

  return (
    <div
      className="mx-auto flex max-w-[1400px] flex-col gap-4 px-7 py-6"
      data-screen-label="ops-territory-review"
    >
      <header>
        <h1 className="m-0 text-2xl">Operational territory review</h1>
        <p className="text-ink/70 m-0 mt-1 text-sm">
          Line-independent queue for CA, OR, and WA accounts missing an operational territory
          assignment.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[200px] flex-col gap-1 text-sm">
          Search
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Account, city, ZIP…"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Store territory
          <Select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}>
            <option value="all">All</option>
            {storeOptions.map((code) => (
              <option key={code} value={code}>
                {code.toUpperCase()}
              </option>
            ))}
          </Select>
        </label>
        <Button type="button" variant="ghost" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {statusMessage ? (
        <p className="text-accent-700 m-0 text-sm" role="alert">
          {statusMessage}
        </p>
      ) : null}
      {error ? (
        <p className="text-accent-700 m-0 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-ink/70 m-0 text-sm" role="status">
          Loading review queue…
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-ink/70 m-0 text-sm">No accounts pending operational territory review.</p>
      ) : (
        <div className="border-ink/10 overflow-auto rounded-lg border">
          <table className="w-full min-w-[960px] border-collapse text-left text-sm">
            <thead className="bg-surface sticky top-0">
              <tr>
                <th className="px-3 py-2 font-semibold">Account</th>
                <th className="px-3 py-2 font-semibold">Store</th>
                <th className="px-3 py-2 font-semibold">City</th>
                <th className="px-3 py-2 font-semibold">ZIP</th>
                <th className="px-3 py-2 font-semibold">Reason</th>
                <th className="px-3 py-2 font-semibold">Suggestion</th>
                <th className="px-3 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const p = item.prospect;
                const busy = busyId === p.id;
                const allowed = allowedOpsCodesForStore(p.territoryCode);
                const assignable = opsTerritories.filter((o) =>
                  (allowed as readonly string[]).includes(o.code),
                );
                const triggerLabel =
                  DETAIL_REASON_LABELS[item.payload.trigger] ?? item.payload.trigger;
                const detail =
                  item.payload.detail_reason != null
                    ? (DETAIL_REASON_LABELS[item.payload.detail_reason] ??
                      item.payload.detail_reason)
                    : null;
                return (
                  <tr key={item.id} className="border-ink/10 border-t align-top">
                    <td className="px-3 py-3 font-medium">{p.name}</td>
                    <td className="px-3 py-3">{p.territoryName ?? p.territoryCode ?? '—'}</td>
                    <td className="px-3 py-3">{p.city ?? '—'}</td>
                    <td className="px-3 py-3">{p.postalCode ?? '—'}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        <Tag variant="outline">{triggerLabel}</Tag>
                        {detail ? <span className="text-ink/60 text-xs">{detail}</span> : null}
                      </div>
                    </td>
                    <td className="px-3 py-3">{suggestionLabel(item)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-2">
                        <Button
                          type="button"
                          variant="primary"
                          disabled={busy || !item.currentSuggestion.ok}
                          onClick={() =>
                            void runAction(p.id, () => applyOpsTerritorySuggestion(p.id))
                          }
                        >
                          Apply suggestion
                        </Button>
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            className="min-w-[160px]"
                            value={manualPick[p.id] ?? ''}
                            onChange={(e) =>
                              setManualPick((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                            disabled={busy || assignable.length === 0}
                          >
                            <option value="">Manual assign…</option>
                            {assignable.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </Select>
                          <Button
                            type="button"
                            disabled={busy || !manualPick[p.id]}
                            onClick={() =>
                              void runAction(p.id, () =>
                                assignOpsTerritory(p.id, manualPick[p.id] ?? ''),
                              )
                            }
                          >
                            Assign
                          </Button>
                        </div>
                        <a
                          href={accountDetailsHref(p.id)}
                          className="text-accent-700 text-sm font-semibold no-underline hover:underline"
                        >
                          Open Account Details
                        </a>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            void runAction(p.id, () => leaveOpsTerritoryUnassigned(p.id))
                          }
                        >
                          Reviewed—leave unassigned
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-ink/60 m-0 text-xs">
        Showing {filtered.length} of {items.length} pending
      </p>
    </div>
  );
}
