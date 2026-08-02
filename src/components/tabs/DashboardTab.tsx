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

interface DashboardTabProps {
  onLogCall: () => void;
  reloadToken?: number;
}

const emptySummary = summarizeDashboard([]);

export function DashboardTab({ onLogCall, reloadToken = 0 }: DashboardTabProps) {
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setFetchError(null);
      const { data, error } = await fetchCalls(500);

      if (!active) return;
      if (error) {
        setSummary(emptySummary);
        setFetchError(error);
        setLoading(false);
        return;
      }
      setSummary(summarizeDashboard(data));
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [reloadToken]);

  const { totalCalls, avgPmf, closedPoCount, pipelineValueCad, reachRatePct } = summary;
  const conversionPct =
    totalCalls > 0 ? Math.round((closedPoCount / totalCalls) * 100) : null;

  return (
    <section className="flex flex-col gap-5" data-screen-label="dashboard">
      {loading && <p className="m-0 text-sm text-ink/60">Loading dashboard…</p>}
      {fetchError && (
        <p className="m-0 text-sm text-accent-800">Could not load calls: {fetchError}</p>
      )}

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
          <CardMeta>
            {avgPmf != null ? 'Across scored calls' : 'Log calls to calculate'}
          </CardMeta>
        </Card>
        <Card>
          <CardKicker>Closed Purchase Orders</CardKicker>
          <CardTitle className="text-[28px]">{closedPoCount}</CardTitle>
          <CardMeta>
            {conversionPct != null
              ? `Conversion rate ${conversionPct}%`
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
                <div className="h-1.5 overflow-hidden rounded-full bg-bg">
                  <div
                    className={`h-full ${row.colorClass}`}
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1.5 rounded-md bg-bg p-3 text-xs">
            <p className="mb-1 font-semibold text-accent-700">Strategic Insight</p>
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
              <p className="text-[11px] uppercase tracking-wider opacity-60">By Channel</p>
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
              <p className="text-[11px] uppercase tracking-wider opacity-60">Outcomes</p>
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
          <div className="border-b border-ink/10 px-4.1 py-3">
            <CardTitle className="text-base">Recent activity</CardTitle>
          </div>
          <ul className="m-0 list-none divide-y divide-ink/10 p-0">
            {summary.recent.map((call) => {
              const channelLabel = prospectForCall(call)?.category;
              return (
                <li
                  key={call.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 px-4.1 py-3.1"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-heading text-[15px] text-ink">
                      {storeName(call.prospect_id)}
                    </span>
                    <span className="text-[13px] text-ink/70">
                      {call.outcome}
                      {channelLabel ? ` · ${channelLabel}` : ''}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[12px] text-ink/65">
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
