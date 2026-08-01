import { PhoneCall } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardKicker, CardMeta, CardTitle } from '@/components/ui/Card';

interface DashboardTabProps {
  onLogCall: () => void;
}

const fitBreakdown = [
  { label: 'High Fit (8–10)', colorClass: 'bg-sage-500' },
  { label: 'Moderate Fit (6–7)', colorClass: 'bg-accent-500' },
  { label: 'Low Fit (1–5)', colorClass: 'bg-neutral-500' },
];

export function DashboardTab({ onLogCall }: DashboardTabProps) {
  return (
    <section className="flex flex-col gap-5" data-screen-label="dashboard">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <Card>
          <CardKicker>Total Calls Logged</CardKicker>
          <CardTitle className="text-[28px]">0</CardTitle>
          <CardMeta>Decision-maker reach rate — awaiting data</CardMeta>
        </Card>
        <Card>
          <CardKicker>Avg PMF Score</CardKicker>
          <CardTitle className="text-[28px]">— / 10</CardTitle>
          <CardMeta>Log calls to calculate</CardMeta>
        </Card>
        <Card>
          <CardKicker>Closed Purchase Orders</CardKicker>
          <CardTitle className="text-[28px]">0</CardTitle>
          <CardMeta>Conversion rate — awaiting data</CardMeta>
        </Card>
        <Card>
          <CardKicker>Pipeline Value</CardKicker>
          <CardTitle className="text-[28px]">$0 CAD</CardTitle>
          <CardMeta>Initial wholesale orders</CardMeta>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
        <Card>
          <CardTitle className="text-base">PMF Fit Breakdown</CardTitle>
          <div className="mt-1.5 flex flex-col gap-2.5 text-xs">
            {fitBreakdown.map((row) => (
              <div key={row.label}>
                <div className="mb-1 flex justify-between">
                  <span>{row.label}</span>
                  <span>0%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-bg">
                  <div className={`h-full w-0 ${row.colorClass}`} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1.5 rounded-md bg-bg p-3 text-xs">
            <p className="mb-1 font-semibold text-accent-700">Strategic Insight</p>
            <p className="opacity-80">
              Log prospect calls to calculate real-time product-market-fit intelligence.
            </p>
          </div>
        </Card>

        <Card>
          <CardTitle className="text-base">PMF by Channel &amp; Call Outcomes</CardTitle>
          <div className="mt-1.5 grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-[11px] uppercase tracking-wider opacity-60">By Channel</p>
              <p className="text-[13px] opacity-60">
                No channel data yet — appears once calls are logged.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-[11px] uppercase tracking-wider opacity-60">Outcomes</p>
              <p className="text-[13px] opacity-60">
                No outcomes yet — appears once calls are logged.
              </p>
            </div>
          </div>
        </Card>
      </div>

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
    </section>
  );
}
