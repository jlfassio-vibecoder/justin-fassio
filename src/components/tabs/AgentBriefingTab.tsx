import { useEffect, useState } from 'react';
import { ClipboardList, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardKicker, CardMeta, CardTitle } from '@/components/ui/Card';
import { useOptionalLineContext } from '@/lib/lineContext';
import { supabase } from '@/lib/supabase';
import type { OutreachBriefingDto } from '@/lib/outreachBriefing';
import type { OutreachLeadRow } from '@/lib/outreachLeadLists';

const ICON_STROKE = 2.75;

type AgentBriefingTabProps = {
  onOpenDraft: (args: { sku: string; draftId: string }) => void;
  onOpenProspect: (args: { prospectId: number; accountStatus?: string }) => void;
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

export function AgentBriefingTab({ onOpenDraft, onOpenProspect }: AgentBriefingTabProps) {
  const lineCtx = useOptionalLineContext();
  const [briefing, setBriefing] = useState<OutreachBriefingDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prepBusy, setPrepBusy] = useState(false);
  const [prepMessage, setPrepMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

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
  }, [reloadToken, lineCtx.multiLineUi, lineCtx.salesLineId]);

  async function runPrepNow() {
    setPrepBusy(true);
    setPrepMessage(null);
    const result = await staffPost('/api/staff/outreach/prep', {});
    setPrepBusy(false);
    if (!result.ok) {
      setPrepMessage(result.error);
      return;
    }
    const data = result.data as {
      noop?: boolean;
      run?: { producedCount?: number; status?: string };
    };
    if (data.noop) {
      setPrepMessage('Prep already complete for that selling day.');
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
          <Button type="button" onClick={() => void runPrepNow()} disabled={prepBusy || loading}>
            {prepBusy ? 'Running prep…' : 'Run prep now'}
          </Button>
        </div>
      </div>

      {loading && <p className="text-ink/60 m-0 text-sm">Loading briefing…</p>}
      {error && <p className="text-accent-800 m-0 text-sm">Could not load briefing: {error}</p>}
      {prepMessage && <p className="text-ink/70 m-0 text-sm">{prepMessage}</p>}

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
            <CardMeta className="mb-2">{briefing.drafts.length} pending</CardMeta>
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
                          <button
                            type="button"
                            className="text-accent-800 font-medium hover:underline"
                            onClick={() =>
                              onOpenProspect({
                                prospectId: d.prospectId,
                                accountStatus: 'prospect',
                              })
                            }
                          >
                            {d.prospectName}
                          </button>
                        </td>
                        <td className="border-ink/[0.06] border-b p-2">
                          <button
                            type="button"
                            className="text-accent-800 hover:underline"
                            onClick={() => onOpenDraft({ sku: d.productSku, draftId: d.draftId })}
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
                    ? ' · even rotation (insufficient data)'
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
              onOpen={(row) =>
                onOpenProspect({ prospectId: row.prospectId, accountStatus: row.accountStatus })
              }
            />
            <LeadList
              title="Hot"
              rows={briefing.hot}
              onOpen={(row) =>
                onOpenProspect({ prospectId: row.prospectId, accountStatus: row.accountStatus })
              }
            />
            <LeadList
              title="Warm"
              rows={briefing.warm}
              onOpen={(row) =>
                onOpenProspect({ prospectId: row.prospectId, accountStatus: row.accountStatus })
              }
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
                  : 'Insufficient attributed conversions — even channel rotation, rank-based product picks, and CRM fit-score ranking'}
                {' · lookback '}
                {briefing.performance.lookbackDays}d
              </CardMeta>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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
              </div>
            </Card>
          )}
        </>
      )}
    </section>
  );
}
