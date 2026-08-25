import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, RefreshCw } from 'lucide-react';
import {
  OgrProductEmailComposerModal,
  type OgrProductEmailComposerDraft,
} from '@/components/OgrProductEmailComposerModal';
import { Button } from '@/components/ui/Button';
import { Card, CardKicker, CardMeta, CardTitle } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';
import { getAgentProductOutreachDraftClient } from '@/lib/agentProductOutreachDraftClient';
import type { CatalogItem } from '@/lib/catalog';
import { buildCatalogItemEmailCardHtml } from '@/lib/catalogItemEmailCardHtml';
import { useOptionalLineContext } from '@/lib/lineContext';
import type { OutreachBriefingDto } from '@/lib/outreachBriefing';
import type { OutreachLeadRow } from '@/lib/outreachLeadLists';
import {
  fetchOperationalTerritories,
  type OperationalTerritoryOption,
} from '@/lib/operationalTerritories/fetchOperationalTerritories';
import { OGR_OPERATIONAL_TERRITORY_CODES } from '@/lib/operationalTerritories/resolve';
import { supabase } from '@/lib/supabase';

const ICON_STROKE = 2.75;
const OGR_OPS_SET = new Set<string>(OGR_OPERATIONAL_TERRITORY_CODES);
const REGIONAL_PREP_LIMIT = 25;

type DraftReviewTarget = {
  draftId: string;
  catalogItemId: string;
  productName: string;
  prospectName?: string;
};

type AgentBriefingTabProps = {
  catalog: CatalogItem[];
  deepLinkSku?: string | null;
  deepLinkDraftId?: string | null;
  onDeepLinkConsumed?: () => void;
  onProductEmailSent?: () => void;
  onLogCallForLead: (prospectId: number) => void;
  briefingReloadToken?: number;
  onOpenProspect: (args: {
    prospectId: number;
    accountStatus?: string;
    openResearch?: boolean;
  }) => void;
};

async function staffGet(
  path: string,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'Not signed in' };
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let payload: Record<string, unknown>;
  try {
    payload = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `Request failed (${res.status})` };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : `Request failed (${res.status})`,
    };
  }
  return { ok: true, data: payload };
}

async function staffPost(
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'Not signed in' };
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });
  let payload: Record<string, unknown>;
  try {
    payload = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `Request failed (${res.status})` };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : `Request failed (${res.status})`,
    };
  }
  return { ok: true, data: payload };
}

function LeadList({
  title,
  rows,
  onOpen,
}: {
  title: string;
  rows: OutreachLeadRow[];
  onOpen: (row: OutreachLeadRow) => void;
}) {
  return (
    <Card>
      <CardTitle className="text-[15px]">{title}</CardTitle>
      <CardMeta className="mb-2">
        {rows.length} lead{rows.length === 1 ? '' : 's'}
      </CardMeta>
      {rows.length === 0 ? (
        <p className="text-ink/50 m-0 text-sm">None right now.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {rows.slice(0, 12).map((row) => (
            <li key={row.prospectId}>
              <button
                type="button"
                className="text-accent-800 hover:bg-accent-50 w-full rounded-md px-2 py-1.5 text-left text-sm"
                onClick={() => onOpen(row)}
              >
                <span className="font-medium">{row.prospectName}</span>
                <span className="text-ink/50 ml-2 text-xs uppercase">{row.leadState}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function AgentBriefingTab({
  catalog,
  deepLinkSku = null,
  deepLinkDraftId = null,
  onDeepLinkConsumed,
  onProductEmailSent,
  onLogCallForLead,
  briefingReloadToken = 0,
  onOpenProspect,
}: AgentBriefingTabProps) {
  const lineCtx = useOptionalLineContext();
  const isOgrLine = !lineCtx.multiLineUi || lineCtx.lineSlug === 'ogr' || lineCtx.lineSlug == null;
  const [briefing, setBriefing] = useState<OutreachBriefingDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prepBusy, setPrepBusy] = useState(false);
  const [prepMessage, setPrepMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [composerDraft, setComposerDraft] = useState<OgrProductEmailComposerDraft | null>(null);
  const [composerProduct, setComposerProduct] = useState<CatalogItem | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [appliedDeepLinkKey, setAppliedDeepLinkKey] = useState('');
  const [opsOptions, setOpsOptions] = useState<OperationalTerritoryOption[]>([]);
  const [opsTerritoryId, setOpsTerritoryId] = useState('');
  const [storeTerritoryCode, setStoreTerritoryCode] = useState<'or' | 'wa' | ''>('or');

  const pendingSku = deepLinkSku?.trim() || null;
  const pendingDraftId = deepLinkDraftId?.trim() || null;
  const pendingDeepLinkKey = `${pendingSku ?? ''}:${pendingDraftId ?? ''}`;

  const catalogById = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);

  const closeComposer = useCallback(() => {
    setComposerOpen(false);
    setComposerDraft(null);
    setComposerProduct(null);
    setComposerError(null);
  }, []);

  const openDraftReview = useCallback(
    async (target: DraftReviewTarget) => {
      setComposerError(null);
      setComposerDraft(null);
      setComposerProduct(null);
      setComposerOpen(false);

      const catalogItem = catalogById.get(target.catalogItemId);
      if (!catalogItem) {
        setComposerError(`Product not found in catalog (${target.productName}).`);
        return;
      }

      const loaded = await getAgentProductOutreachDraftClient(target.draftId);
      if (!loaded.ok) {
        setComposerError(loaded.error);
        return;
      }

      const d = loaded.draft;
      setComposerProduct(catalogItem);
      setComposerDraft({
        id: d.id,
        to: d.toEmail,
        toName: d.toName,
        subject: d.subject,
        introText: d.introText,
        closingText: d.closingText,
        prospectId: d.prospectId,
        accountContactId: d.accountContactId,
        catalogItemId: d.catalogItemId,
        prospectName: target.prospectName?.trim() || undefined,
        productSku: d.payload.sku,
        productSlug: d.payload.slug,
      });
      setComposerOpen(true);
    },
    [catalogById],
  );

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      const qs =
        lineCtx.multiLineUi && lineCtx.salesLineId
          ? `?sales_line_id=${encodeURIComponent(lineCtx.salesLineId)}`
          : '';
      const result = await staffGet(`/api/staff/outreach/briefing${qs}`);
      if (!active) return;
      if (!result.ok) {
        setBriefing(null);
        setError(result.error);
        setLoading(false);
        return;
      }
      const payload = result.data as { briefing?: OutreachBriefingDto };
      setBriefing(payload.briefing ?? null);
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [reloadToken, briefingReloadToken, lineCtx.multiLineUi, lineCtx.salesLineId]);

  useEffect(() => {
    if (!isOgrLine) return;
    let active = true;
    void fetchOperationalTerritories().then((result) => {
      if (!active) return;
      if (result.error) return;
      const ogrOps = result.data.filter((row) => OGR_OPS_SET.has(row.code));
      setOpsOptions(ogrOps);
      setOpsTerritoryId((prev) => {
        if (prev && ogrOps.some((row) => row.id === prev)) return prev;
        const pnwWest = ogrOps.find((row) => row.code === 'pnw-west');
        return pnwWest?.id ?? ogrOps[0]?.id ?? '';
      });
    });
    return () => {
      active = false;
    };
  }, [isOgrLine]);

  // Copilot suggestion ignored: useEffect setState fails react-hooks/set-state-in-effect; render-time prop sync is the React-supported pattern.
  // Copilot suggestion ignored: a new event/token deep-link protocol is out of scope; drawer close now clears its applied deep-link state.
  if (pendingDraftId && pendingDeepLinkKey !== appliedDeepLinkKey && !loading && briefing) {
    setAppliedDeepLinkKey(pendingDeepLinkKey);
    const row = briefing.drafts.find((d) => d.draftId === pendingDraftId);
    const catalogItemId =
      row?.catalogItemId ??
      (pendingSku ? catalog.find((item) => item.sku === pendingSku)?.id : undefined);

    if (!catalogItemId) {
      queueMicrotask(() => {
        setComposerError('Could not resolve product for draft deep link.');
        onDeepLinkConsumed?.();
      });
    } else {
      queueMicrotask(() => {
        void openDraftReview({
          draftId: pendingDraftId,
          catalogItemId,
          productName: row?.productName ?? pendingSku ?? 'Product',
          prospectName: row?.prospectName,
        }).finally(() => {
          onDeepLinkConsumed?.();
        });
      });
    }
  }

  async function runPrepNow() {
    if (!isOgrLine) {
      setPrepMessage('Regional prep is available on OGR only.');
      return;
    }
    if (!opsTerritoryId) {
      setPrepMessage('Select an operational territory first.');
      return;
    }
    setPrepBusy(true);
    setPrepMessage(null);
    const body: Record<string, unknown> = {
      operationalTerritoryId: opsTerritoryId,
      limit: REGIONAL_PREP_LIMIT,
    };
    if (storeTerritoryCode) body.storeTerritoryCode = storeTerritoryCode;
    if (briefing?.sellingDate) body.preparationDate = briefing.sellingDate;
    const result = await staffPost('/api/staff/outreach/prep', body);
    setPrepBusy(false);
    if (!result.ok) {
      setPrepMessage(result.error);
      return;
    }
    const data = result.data as {
      noop?: boolean;
      run?: { producedCount?: number; status?: string; reason?: string | null };
    };
    if (data.noop) {
      setPrepMessage('Prep already complete for that region and selling day.');
    } else if (data.run?.status === 'empty_pool') {
      setPrepMessage(
        'No sendable accounts in that region yet. Lookalikes need a usable contact email (and product-fit). Add emails, then retry.',
      );
    } else {
      setPrepMessage(
        `Prep finished (${data.run?.status ?? 'done'}${
          typeof data.run?.producedCount === 'number'
            ? `, ${data.run.producedCount} new drafts`
            : ''
        }).`,
      );
    }
    setReloadToken((n) => n + 1);
  }

  const goal = briefing?.goal;
  const prep = briefing?.prep;
  const composerCardHtml =
    composerOpen && composerProduct ? buildCatalogItemEmailCardHtml(composerProduct, 'ca') : '';

  return (
    <section className="flex flex-col gap-5" data-screen-label="briefing">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList
            className="text-accent-700 h-5 w-5"
            strokeWidth={ICON_STROKE}
            aria-hidden
          />
          <h2 className="text-ink m-0 text-lg font-semibold">Daily Agent Briefing</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setReloadToken((n) => n + 1)}
            disabled={loading}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
            Refresh
          </Button>
          {isOgrLine ? (
            <>
              <label className="sr-only" htmlFor="briefing-ops-territory">
                Operational territory
              </label>
              <Select
                id="briefing-ops-territory"
                className="w-auto min-w-[10rem]"
                value={opsTerritoryId}
                onChange={(e) => setOpsTerritoryId(e.target.value)}
                disabled={prepBusy || loading || opsOptions.length === 0}
              >
                {opsOptions.length === 0 ? (
                  <option value="">Loading territories…</option>
                ) : (
                  opsOptions.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))
                )}
              </Select>
              <label className="sr-only" htmlFor="briefing-store-territory">
                Store geography
              </label>
              <Select
                id="briefing-store-territory"
                className="w-auto min-w-[7rem]"
                value={storeTerritoryCode}
                onChange={(e) =>
                  setStoreTerritoryCode(
                    e.target.value === 'wa' || e.target.value === 'or' ? e.target.value : '',
                  )
                }
                disabled={prepBusy || loading}
              >
                <option value="or">Oregon</option>
                <option value="wa">Washington</option>
                <option value="">All store geos</option>
              </Select>
              <Button
                type="button"
                onClick={() => void runPrepNow()}
                disabled={prepBusy || loading || !opsTerritoryId}
              >
                {prepBusy ? 'Running prep…' : `Run prep now (${REGIONAL_PREP_LIMIT})`}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {loading && <p className="text-ink/60 m-0 text-sm">Loading briefing…</p>}
      {error && <p className="text-accent-800 m-0 text-sm">Could not load briefing: {error}</p>}
      {prepMessage && <p className="text-ink/70 m-0 text-sm">{prepMessage}</p>}
      {composerError && <p className="text-accent-800 m-0 text-sm">{composerError}</p>}

      {briefing && (
        <>
          <Card
            className={
              prep?.status === 'failed' || prep?.status === 'partial'
                ? 'border-accent-300 bg-accent-50/40'
                : prep?.status === 'missing'
                  ? 'border-ink/15 bg-bg'
                  : 'border-emerald-200 bg-emerald-50/40'
            }
          >
            <CardKicker>Prep · {briefing.sellingDate}</CardKicker>
            <CardTitle className="text-[16px]">{prep?.message}</CardTitle>
            <CardMeta>
              As of {briefing.asOfDate}
              {prep?.run
                ? ` · capacity ${prep.run.capacity} · pending before ${prep.run.pendingBefore} · produced ${prep.run.producedCount}`
                : null}
            </CardMeta>
          </Card>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
            <Card>
              <CardKicker>Monthly target</CardKicker>
              <CardTitle className="text-2xl">{goal?.monthlyTarget ?? '—'}</CardTitle>
            </Card>
            <Card>
              <CardKicker>MTD Active Accounts</CardKicker>
              <CardTitle className="text-2xl">{goal?.mtdAccounts ?? '—'}</CardTitle>
            </Card>
            <Card>
              <CardKicker>Remaining goal</CardKicker>
              <CardTitle className="text-2xl">{goal?.remainingGoal ?? '—'}</CardTitle>
            </Card>
            <Card>
              <CardKicker>Recommended sends today</CardKicker>
              <CardTitle className="text-2xl">{goal?.recommendedDailySends ?? '—'}</CardTitle>
              <CardMeta>
                {goal?.rateSource ?? ''}
                {goal?.goalMet ? ' · goal met' : ''}
              </CardMeta>
            </Card>
            <Card>
              <CardKicker>Projected attainment</CardKicker>
              <CardTitle className="text-2xl">
                {goal ? Math.round(goal.projectedAttainment * 10) / 10 : '—'}
              </CardTitle>
            </Card>
          </div>

          <Card>
            <CardTitle className="text-[15px]">Drafts ready for review</CardTitle>
            <CardMeta className="mb-2">
              {briefing.drafts.length} pending · open a draft and use Add copy for personalized
              intro/closing (prep leaves generic stubs)
            </CardMeta>
            {briefing.drafts.length === 0 ? (
              <p className="text-ink/50 m-0 text-sm">No pending drafts for this selling date.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="text-ink/50 text-xs uppercase">
                      <th className="border-ink/10 border-b p-2 font-medium">Prospect</th>
                      <th className="border-ink/10 border-b p-2 font-medium">Product</th>
                      <th className="border-ink/10 border-b p-2 font-medium">Channel</th>
                      <th className="border-ink/10 border-b p-2 font-medium">To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {briefing.drafts.map((d) => (
                      <tr key={d.draftId} className="hover:bg-bg/80">
                        <td className="border-ink/[0.06] border-b p-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="text-accent-800 font-medium hover:underline"
                              onClick={() =>
                                onOpenProspect({
                                  prospectId: d.prospectId,
                                  accountStatus: d.accountStatus ?? 'prospect',
                                })
                              }
                            >
                              {d.prospectName}
                            </button>
                            <button
                              type="button"
                              className="text-ink/55 hover:text-accent-800 text-xs hover:underline"
                              onClick={() =>
                                onOpenProspect({
                                  prospectId: d.prospectId,
                                  accountStatus: d.accountStatus ?? 'prospect',
                                  openResearch: true,
                                })
                              }
                            >
                              Research
                            </button>
                          </div>
                        </td>
                        <td className="border-ink/[0.06] border-b p-2">
                          <button
                            type="button"
                            className="text-accent-800 hover:underline"
                            onClick={() =>
                              void openDraftReview({
                                draftId: d.draftId,
                                catalogItemId: d.catalogItemId,
                                productName: d.productName,
                                prospectName: d.prospectName,
                              })
                            }
                          >
                            {d.productName}{' '}
                            <span className="text-ink/45 text-xs">({d.productSku})</span>
                          </button>
                        </td>
                        <td className="border-ink/[0.06] border-b p-2 text-xs">
                          {d.primaryChannel ?? '—'}
                        </td>
                        <td className="border-ink/[0.06] border-b p-2 text-xs">{d.toEmail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {briefing.channelAllocation && (
            <Card>
              <CardTitle className="text-[15px]">Channel allocation</CardTitle>
              <CardMeta className="mb-2">
                From last prep run
                {briefing.channelAllocation.meta?.weightSource === 'measured'
                  ? ' · measured conversion weights'
                  : briefing.channelAllocation.meta?.weightSource === 'uniform'
                    ? briefing.adaptiveWeightsEnabled
                      ? ' · even rotation (insufficient data)'
                      : ' · even rotation (adaptive weights off)'
                    : ' (informational)'}
              </CardMeta>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0 text-sm">
                {Object.entries(briefing.channelAllocation.slotsByChannel)
                  .filter(([, n]) => n > 0)
                  .map(([ch, n]) => (
                    <li key={ch} className="bg-bg rounded-md px-2.5 py-1">
                      {ch}: <strong>{n}</strong>
                    </li>
                  ))}
              </ul>
            </Card>
          )}

          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
            <LeadList
              title="Call Today"
              rows={briefing.callToday}
              onOpen={(row) => onLogCallForLead(row.prospectId)}
            />
            <LeadList
              title="Hot"
              rows={briefing.hot}
              onOpen={(row) => onLogCallForLead(row.prospectId)}
            />
            <LeadList
              title="Warm"
              rows={briefing.warm}
              onOpen={(row) => onLogCallForLead(row.prospectId)}
            />
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
            <Card>
              <CardTitle className="text-[15px]">Recent engagement (7d)</CardTitle>
              {briefing.recentEngagement.length === 0 ? (
                <p className="text-ink/50 m-0 text-sm">No clicks in the last 7 days.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                  {briefing.recentEngagement.map((e) => (
                    <li key={e.prospectId}>
                      <button
                        type="button"
                        className="text-accent-800 hover:underline"
                        onClick={() => onOpenProspect({ prospectId: e.prospectId })}
                      >
                        {e.prospectName}
                      </button>
                      <span className="text-ink/50 ml-2 text-xs">
                        {e.clickCount} click{e.clickCount === 1 ? '' : 's'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardTitle className="text-[15px]">Recent conversions (7d)</CardTitle>
              {briefing.recentConversions.length === 0 ? (
                <p className="text-ink/50 m-0 text-sm">No conversions in the last 7 days.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                  {briefing.recentConversions.map((c) => (
                    <li key={`${c.prospectId}-${c.convertedAt}`}>
                      <button
                        type="button"
                        className="text-accent-800 hover:underline"
                        onClick={() =>
                          onOpenProspect({
                            prospectId: c.prospectId,
                            accountStatus: 'active_account',
                          })
                        }
                      >
                        {c.prospectName}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {briefing.performance && (
            <Card>
              <CardTitle className="text-[15px]">Learning slices</CardTitle>
              <CardMeta className="mb-2">
                {briefing.channelAllocation?.meta?.weightSource === 'measured'
                  ? 'Channel allocation, product selection, and prospect ranking use blended conversion rates'
                  : briefing.channelAllocation?.meta?.weightSource === 'uniform'
                    ? briefing.adaptiveWeightsEnabled
                      ? 'Insufficient attributed conversions — even channel rotation, rank-based product picks, and CRM fit-score ranking'
                      : 'Adaptive weights disabled in goals settings — even channel rotation, rank-based product picks, and CRM fit-score ranking'
                    : 'Performance data shown for review — run nightly prep to apply learning weights'}
                {' · '}
                {briefing.leadRules.source === 'measured'
                  ? 'Lead rules calibrated from attributed Warm/Hot performance'
                  : 'Provisional lead rules — insufficient attributed conversions'}
                {briefing.leadRules.adjustedFields.length > 0
                  ? ` · tuned: ${briefing.leadRules.adjustedFields.slice(0, 4).join(', ')}`
                  : ''}
                {' · lookback '}
                {briefing.performance.lookbackDays}d
              </CardMeta>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="overflow-x-auto">
                  <p className="text-ink/50 m-0 mb-2 text-xs uppercase">By channel</p>
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="text-ink/50 text-xs uppercase">
                        <th className="border-ink/10 border-b p-2 font-medium">Channel</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Sends</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Attributed</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {briefing.performance.byChannel.slice(0, 8).map((s) => (
                        <tr key={s.key}>
                          <td className="border-ink/[0.06] border-b p-2">{s.label}</td>
                          <td className="border-ink/[0.06] border-b p-2">{s.sends}</td>
                          <td className="border-ink/[0.06] border-b p-2">
                            {s.attributedConversions}
                          </td>
                          <td className="border-ink/[0.06] border-b p-2 text-xs">{s.confidence}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="overflow-x-auto">
                  <p className="text-ink/50 m-0 mb-2 text-xs uppercase">By product</p>
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="text-ink/50 text-xs uppercase">
                        <th className="border-ink/10 border-b p-2 font-medium">Product</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Sends</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Attributed</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {briefing.performance.byProduct.length === 0 ? (
                        <tr>
                          <td className="border-ink/[0.06] text-ink/60 border-b p-2" colSpan={4}>
                            No product outreach data yet.
                          </td>
                        </tr>
                      ) : (
                        [...briefing.performance.byProduct]
                          .sort(
                            (a, b) =>
                              b.attributedConversions - a.attributedConversions ||
                              b.sends - a.sends,
                          )
                          .slice(0, 6)
                          .map((s) => (
                            <tr key={s.key}>
                              <td className="border-ink/[0.06] border-b p-2">{s.label}</td>
                              <td className="border-ink/[0.06] border-b p-2">{s.sends}</td>
                              <td className="border-ink/[0.06] border-b p-2">
                                {s.attributedConversions}
                              </td>
                              <td className="border-ink/[0.06] border-b p-2 text-xs">
                                {s.confidence}
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="overflow-x-auto">
                  <p className="text-ink/50 m-0 mb-2 text-xs uppercase">By fit band</p>
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="text-ink/50 text-xs uppercase">
                        <th className="border-ink/10 border-b p-2 font-medium">Fit band</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Sends</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Attributed</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {briefing.performance.byFitBand.length === 0 ? (
                        <tr>
                          <td className="border-ink/[0.06] text-ink/60 border-b p-2" colSpan={4}>
                            No fit-band outreach data yet.
                          </td>
                        </tr>
                      ) : (
                        [...briefing.performance.byFitBand]
                          .sort(
                            (a, b) =>
                              b.attributedConversions - a.attributedConversions ||
                              b.sends - a.sends,
                          )
                          .map((s) => (
                            <tr key={s.key}>
                              <td className="border-ink/[0.06] border-b p-2">{s.label}</td>
                              <td className="border-ink/[0.06] border-b p-2">{s.sends}</td>
                              <td className="border-ink/[0.06] border-b p-2">
                                {s.attributedConversions}
                              </td>
                              <td className="border-ink/[0.06] border-b p-2 text-xs">
                                {s.confidence}
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="overflow-x-auto">
                  <p className="text-ink/50 m-0 mb-2 text-xs uppercase">By lead state</p>
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="text-ink/50 text-xs uppercase">
                        <th className="border-ink/10 border-b p-2 font-medium">Lead state</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Sends</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Attributed</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {briefing.performance.byLeadState.length === 0 ? (
                        <tr>
                          <td className="border-ink/[0.06] text-ink/60 border-b p-2" colSpan={4}>
                            No lead-state outreach data yet.
                          </td>
                        </tr>
                      ) : (
                        [...briefing.performance.byLeadState]
                          .sort(
                            (a, b) =>
                              b.attributedConversions - a.attributedConversions ||
                              b.sends - a.sends,
                          )
                          .map((s) => (
                            <tr key={s.key}>
                              <td className="border-ink/[0.06] border-b p-2">{s.label}</td>
                              <td className="border-ink/[0.06] border-b p-2">{s.sends}</td>
                              <td className="border-ink/[0.06] border-b p-2">
                                {s.attributedConversions}
                              </td>
                              <td className="border-ink/[0.06] border-b p-2 text-xs">
                                {s.confidence}
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      {composerProduct && composerDraft ? (
        <OgrProductEmailComposerModal
          open={composerOpen}
          onClose={closeComposer}
          onSent={() => {
            closeComposer();
            setReloadToken((n) => n + 1);
            onProductEmailSent?.();
          }}
          onDraftCancelled={() => {
            closeComposer();
            setReloadToken((n) => n + 1);
          }}
          productId={composerProduct.id}
          productName={composerProduct.name.trim()}
          cardHtml={composerCardHtml}
          draft={composerDraft}
          publicMarket="ca"
        />
      ) : null}
    </section>
  );
}
