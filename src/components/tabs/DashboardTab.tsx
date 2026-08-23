import { useEffect, useState } from 'react';
import { PhoneCall } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardKicker, CardMeta, CardTitle } from '@/components/ui/Card';
import {
  prospectForCall,
  storeName,
  summarizeDashboard,
  type DashboardSummary,
} from '@/lib/callAggregates';
import { fetchCalls } from '@/lib/calls';
import {
  loadOutreachGoalDashboardSnapshot,
  type OutreachGoalDashboardSnapshot,
} from '@/lib/outreachGoalDashboard';
import { useOptionalLineContext } from '@/lib/lineContext';
import type { Prospect } from '@/lib/prospects';

interface DashboardTabProps {
  prospects: Prospect[];
  onLogCall: () => void;
  reloadToken?: number;
}

const emptySummary = summarizeDashboard([]);

export function DashboardTab({ prospects, onLogCall, reloadToken = 0 }: DashboardTabProps) {
  const lineCtx = useOptionalLineContext();
  const salesLineId = lineCtx.multiLineUi ? lineCtx.salesLineId : null;
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [goalSnapshot, setGoalSnapshot] = useState<OutreachGoalDashboardSnapshot | null>(null);
  const [goalError, setGoalError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setFetchError(null);
      setGoalError(null);
      const callOpts = salesLineId ? { limit: 500, salesLineId } : 500;
      const isNonOgrScoped = Boolean(
        lineCtx.multiLineUi && lineCtx.lineSlug && lineCtx.lineSlug !== 'ogr',
      );

      if (isNonOgrScoped) {
        const { data, error } = await fetchCalls(callOpts);
        if (!active) return;
        if (error) {
          setSummary(emptySummary);
          setFetchError(error);
        } else {
          setSummary(summarizeDashboard(data, prospects));
        }
        setGoalSnapshot(null);
        setGoalError(null);
        setLoading(false);
        return;
      }

      const [{ data, error }, goals] = await Promise.all([
        fetchCalls(callOpts),
        loadOutreachGoalDashboardSnapshot(),
      ]);

      if (!active) return;
      if (error) {
        setSummary(emptySummary);
        setFetchError(error);
      } else {
        setSummary(summarizeDashboard(data, prospects));
      }
      if (goals.ok) {
        setGoalSnapshot(goals.snapshot);
      } else {
        setGoalSnapshot(null);
        setGoalError(goals.error);
      }
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [reloadToken, prospects, salesLineId, lineCtx.multiLineUi, lineCtx.lineSlug]);

  const { totalCalls, avgPmf, closedPoCount, pipelineValueCad, reachRatePct } = summary;
  const conversionPct = totalCalls > 0 ? Math.round((closedPoCount / totalCalls) * 100) : null;
  const progress = goalSnapshot?.progress;
  const pace = goalSnapshot?.pace;
  const rate = goalSnapshot?.rate;
  const performance = goalSnapshot?.performance;

  return (
    <section className="flex flex-col gap-5" data-screen-label="dashboard">
      {loading && <p className="text-ink/60 m-0 text-sm">Loading dashboard…</p>}
      {fetchError && (
        <p className="text-accent-800 m-0 text-sm">Could not load calls: {fetchError}</p>
      )}
      {goalError && (
        <p className="text-accent-800 m-0 text-sm">Could not load account goals: {goalError}</p>
      )}

      <div>
        <p className="text-ink/55 m-0 mb-2 text-[11px] tracking-wider uppercase">
          New accounts (primary)
        </p>
        <p className="text-ink/60 m-0 mb-3 text-xs">
          Primary KPI is Prospect → Active Account. Opens, clicks, Warm/Hot, and calls are leading
          indicators — not the monthly goal.
        </p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          <Card>
            <CardKicker>Accounts opened MTD</CardKicker>
            <CardTitle className="text-[28px]">
              {progress != null ? `${progress.mtdAccounts} / ${progress.monthlyTarget}` : '—'}
            </CardTitle>
            <CardMeta>
              {pace?.goalMet
                ? 'Goal met — recommendation paused'
                : progress != null
                  ? `${progress.remainingGoal} remaining · ${progress.remainingSellingDays} selling days left`
                  : 'Load goals to calculate'}
            </CardMeta>
          </Card>
          <Card>
            <CardKicker>Projected attainment</CardKicker>
            <CardTitle className="text-[28px]">
              {pace != null ? pace.projectedAttainment : '—'}
            </CardTitle>
            <CardMeta>
              {pace?.monthEnded
                ? 'Month ended'
                : rate != null
                  ? `Rate source: ${rate.rateSource === 'planning' ? 'planning assumption' : 'blended measured'}`
                  : 'Awaiting data'}
            </CardMeta>
          </Card>
          <Card>
            <CardKicker>Recommended daily outreach</CardKicker>
            <CardTitle className="text-[28px]">
              {pace != null ? pace.recommendedDailySends : '—'}
            </CardTitle>
            <CardMeta>
              {pace?.goalMet
                ? 'Paused — over goal'
                : progress != null && !progress.isSellingDay
                  ? '0 today (non-selling day)'
                  : 'Sends/day · staff still reviews & sends'}
            </CardMeta>
          </Card>
        </div>
      </div>

      {performance && (performance.byChannel.length > 0 || performance.byLeadState.length > 0) ? (
        <Card>
          <CardTitle className="text-base">Learning inputs (attributed only)</CardTitle>
          <p className="text-ink/60 m-0 mt-1 text-xs">
            Channel allocation and product/fit targeting use measured weights when data suffices.
            Warm/Hot lead rules calibrate from attributed lead-state performance.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="text-[11px] tracking-wider uppercase opacity-60">By channel</p>
              {performance.byChannel.length === 0 ? (
                <p className="text-[13px] opacity-60">No attributed channel data yet.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
                  {performance.byChannel.slice(0, 6).map((row) => (
                    <li key={row.key} className="flex justify-between gap-2">
                      <span>{row.label}</span>
                      <span className="opacity-70">
                        {row.attributedConversions}/{row.sends}
                        {row.conversionRate != null
                          ? ` · ${(row.conversionRate * 100).toFixed(1)}%`
                          : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-[11px] tracking-wider uppercase opacity-60">By lead state</p>
              {performance.byLeadState.length === 0 ? (
                <p className="text-[13px] opacity-60">No attributed lead-state data yet.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
                  {performance.byLeadState.map((row) => (
                    <li key={row.key} className="flex justify-between gap-2">
                      <span>{row.label}</span>
                      <span className="opacity-70">
                        {row.attributedConversions}/{row.sends}
                        {row.conversionRate != null
                          ? ` · ${(row.conversionRate * 100).toFixed(1)}%`
                          : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <Card>
          <CardKicker>Total Calls Logged</CardKicker>
          <CardTitle className="text-[28px]">{totalCalls}</CardTitle>
          <CardMeta>
            {reachRatePct != null
              ? `Decision-maker reach rate ${reachRatePct}%`
              : 'Decision-maker reach rate — awaiting data'}
          </CardMeta>
        </Card>
        <Card>
          <CardKicker>Avg PMF Score</CardKicker>
          <CardTitle className="text-[28px]">
            {avgPmf != null ? `${avgPmf.toFixed(1)} / 10` : '— / 10'}
          </CardTitle>
          <CardMeta>{avgPmf != null ? 'Across scored calls' : 'Log calls to calculate'}</CardMeta>
        </Card>
        <Card>
          <CardKicker>Closed Purchase Orders</CardKicker>
          <CardTitle className="text-[28px]">{closedPoCount}</CardTitle>
          <CardMeta>
            {conversionPct != null
              ? `Call conversion rate ${conversionPct}% (leading)`
              : 'Conversion rate — awaiting data'}
          </CardMeta>
        </Card>
        <Card>
          <CardKicker>Pipeline Value</CardKicker>
          <CardTitle className="text-[28px]">
            $
            {pipelineValueCad.toLocaleString('en-CA', {
              maximumFractionDigits: 0,
            })}{' '}
            CAD
          </CardTitle>
          <CardMeta>Initial wholesale orders</CardMeta>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
        <Card>
          <CardTitle className="text-base">PMF Fit Breakdown</CardTitle>
          <div className="mt-1.5 flex flex-col gap-2.5 text-xs">
            {summary.fitBreakdown.map((row) => (
              <div key={row.label}>
                <div className="mb-1 flex justify-between">
                  <span>{row.label}</span>
                  <span>{row.pct}%</span>
                </div>
                <div className="bg-bg h-1.5 overflow-hidden rounded-full">
                  <div className={`h-full ${row.colorClass}`} style={{ width: `${row.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="bg-bg mt-1.5 rounded-md p-3 text-xs">
            <p className="text-accent-700 mb-1 font-semibold">Strategic Insight</p>
            <p className="opacity-80">
              {totalCalls > 0
                ? 'Fit mix updates as you log PMF scores on each call.'
                : 'Log prospect calls to calculate real-time product-market-fit intelligence.'}
            </p>
          </div>
        </Card>

        <Card>
          <CardTitle className="text-base">PMF by Channel &amp; Call Outcomes</CardTitle>
          <div className="mt-1.5 grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-[11px] tracking-wider uppercase opacity-60">By Channel</p>
              {summary.byChannel.length === 0 ? (
                <p className="text-[13px] opacity-60">
                  No channel data yet — appears once calls are logged.
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
                  {summary.byChannel.map((row) => (
                    <li key={row.category} className="flex justify-between gap-2">
                      <span>{row.category}</span>
                      <span className="opacity-70">
                        {row.count}
                        {row.avgPmf != null ? ` · avg ${row.avgPmf.toFixed(1)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-[11px] tracking-wider uppercase opacity-60">Outcomes</p>
              {summary.byOutcome.length === 0 ? (
                <p className="text-[13px] opacity-60">
                  No outcomes yet — appears once calls are logged.
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
                  {summary.byOutcome.map((row) => (
                    <li key={row.outcome} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">{row.outcome}</span>
                      <span className="shrink-0 opacity-70">{row.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      </div>

      {summary.recent.length === 0 ? (
        <Card elevation="md" className="items-center gap-2.5 px-5 py-10 text-center">
          <PhoneCall size={32} strokeWidth={2.75} className="text-accent-500" />
          <CardTitle className="text-lg">No recent call activity</CardTitle>
          <p className="max-w-[44ch] text-[13px] opacity-70">
            Your latest prospect calls will show here — store, channel, outcome, PMF score and order
            value at a glance.
          </p>
          <Button variant="primary" onClick={onLogCall} className="mt-1.5">
            Log Your First Call
          </Button>
        </Card>
      ) : (
        <Card elevation="md" className="gap-0 overflow-hidden p-0">
          <div className="border-ink/10 px-4.1 border-b py-3">
            <CardTitle className="text-base">Recent activity</CardTitle>
          </div>
          <ul className="divide-ink/10 m-0 list-none divide-y p-0">
            {summary.recent.map((call) => {
              const channelLabel = prospectForCall(call, prospects)?.category;
              return (
                <li
                  key={call.id}
                  className="px-4.1 py-3.1 flex flex-wrap items-baseline justify-between gap-2"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-heading text-ink text-[15px]">
                      {storeName(call.prospect_id, prospects)}
                    </span>
                    <span className="text-ink/70 text-[13px]">
                      {call.outcome}
                      {channelLabel ? ` · ${channelLabel}` : ''}
                    </span>
                  </div>
                  <div className="text-ink/65 flex flex-wrap items-center gap-3 text-[12px]">
                    <span>PMF {call.pmf_score ?? '—'}</span>
                    <span>
                      $
                      {Number(call.order_value_cad ?? 0).toLocaleString('en-CA', {
                        maximumFractionDigits: 0,
                      })}{' '}
                      CAD
                    </span>
                    <span>{call.call_date}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </section>
  );
}
