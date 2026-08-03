import type { CallRow } from '@/lib/calls';
import type { Prospect } from '@/lib/prospects';

export type ChannelFilter =
  | 'All Retail Channels'
  | 'Golf Pro Shops'
  | 'Marinas'
  | 'Hardware / Farm Co-op'
  | 'Resort Gift';

export type OutcomeFilter =
  | 'All Call Outcomes'
  | 'Closed PO'
  | 'Sample Requested'
  | 'Follow-up Scheduled'
  | 'Gatekeeper'
  | 'Not Interested';

export interface CallFilterOptions {
  search: string;
  channel: ChannelFilter;
  outcome: OutcomeFilter;
}

const CHANNEL_TO_CATEGORY: Record<Exclude<ChannelFilter, 'All Retail Channels'>, Prospect['category']> =
  {
    'Golf Pro Shops': 'Golf',
    Marinas: 'Marina',
    'Hardware / Farm Co-op': 'Hardware',
    'Resort Gift': 'Resort Gift',
  };

/** UI filter labels → substrings that match persisted Log Call outcome strings. */
const OUTCOME_FILTER_NEEDLE: Record<Exclude<OutcomeFilter, 'All Call Outcomes'>, string> = {
  'Closed PO': 'closed po',
  'Sample Requested': 'sample package',
  'Follow-up Scheduled': 'follow-up scheduled',
  Gatekeeper: 'gatekeeper',
  'Not Interested': 'not interested',
};

function byId(prospects: Prospect[]): Map<number, Prospect> {
  return new Map(prospects.map((p) => [p.id, p]));
}

export function prospectForCall(call: CallRow, prospects: Prospect[]): Prospect | undefined {
  return prospects.find((p) => p.id === call.prospect_id);
}

export function storeName(prospectId: number, prospects: Prospect[]): string {
  return prospects.find((p) => p.id === prospectId)?.name ?? `Prospect #${prospectId}`;
}

export function filterCalls(
  calls: CallRow[],
  options: CallFilterOptions,
  prospects: Prospect[],
): CallRow[] {
  const index = byId(prospects);
  const q = options.search.trim().toLowerCase();
  const category =
    options.channel === 'All Retail Channels' ? null : CHANNEL_TO_CATEGORY[options.channel];
  const outcomeNeedle =
    options.outcome === 'All Call Outcomes' ? null : OUTCOME_FILTER_NEEDLE[options.outcome];

  return calls.filter((call) => {
    const prospect = index.get(call.prospect_id);
    if (category && prospect?.category !== category) return false;
    if (outcomeNeedle && !call.outcome.toLowerCase().includes(outcomeNeedle)) return false;
    if (q) {
      const hay = [
        prospect?.name ?? `Prospect #${call.prospect_id}`,
        call.contact_name ?? '',
        call.notes ?? '',
        call.outcome,
        prospect?.category ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export type FitBucket = {
  label: string;
  colorClass: string;
  pct: number;
};

export type ChannelStat = {
  category: Prospect['category'];
  count: number;
  avgPmf: number | null;
};

export type OutcomeStat = {
  outcome: string;
  count: number;
};

export type DashboardSummary = {
  totalCalls: number;
  avgPmf: number | null;
  closedPoCount: number;
  pipelineValueCad: number;
  reachRatePct: number | null;
  fitBreakdown: FitBucket[];
  byChannel: ChannelStat[];
  byOutcome: OutcomeStat[];
  recent: CallRow[];
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function summarizeDashboard(calls: CallRow[], prospects: Prospect[] = []): DashboardSummary {
  const index = byId(prospects);
  const totalCalls = calls.length;
  const scores = calls.map((c) => c.pmf_score).filter((s): s is number => s != null);
  const avgPmf = scores.length ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  const closedPoCount = calls.filter((c) => c.outcome.includes('Closed PO')).length;
  const pipelineValueCad = calls.reduce((sum, c) => sum + Number(c.order_value_cad ?? 0), 0);

  const reached = calls.filter((c) => c.outcome !== 'Left Message / Gatekeeper').length;
  const reachRatePct = totalCalls ? Math.round((reached / totalCalls) * 100) : null;

  const high = scores.filter((s) => s >= 8).length;
  const mod = scores.filter((s) => s >= 6 && s <= 7).length;
  const low = scores.filter((s) => s <= 5).length;
  const scored = scores.length || 1;

  const fitBreakdown: FitBucket[] = [
    {
      label: 'High Fit (8–10)',
      colorClass: 'bg-sage-500',
      pct: totalCalls ? Math.round((high / scored) * 100) : 0,
    },
    {
      label: 'Moderate Fit (6–7)',
      colorClass: 'bg-accent-500',
      pct: totalCalls ? Math.round((mod / scored) * 100) : 0,
    },
    {
      label: 'Low Fit (1–5)',
      colorClass: 'bg-neutral-500',
      pct: totalCalls ? Math.round((low / scored) * 100) : 0,
    },
  ];

  const channelMap = new Map<Prospect['category'], { sum: number; scored: number; count: number }>();
  for (const call of calls) {
    const cat = index.get(call.prospect_id)?.category;
    if (!cat) continue;
    const entry = channelMap.get(cat) ?? { sum: 0, scored: 0, count: 0 };
    entry.count += 1;
    if (call.pmf_score != null) {
      entry.sum += call.pmf_score;
      entry.scored += 1;
    }
    channelMap.set(cat, entry);
  }
  const byChannel: ChannelStat[] = [...channelMap.entries()]
    .map(([category, v]) => ({
      category,
      count: v.count,
      avgPmf: v.scored ? round1(v.sum / v.scored) : null,
    }))
    .sort((a, b) => b.count - a.count);

  const outcomeMap = new Map<string, number>();
  for (const call of calls) {
    outcomeMap.set(call.outcome, (outcomeMap.get(call.outcome) ?? 0) + 1);
  }
  const byOutcome: OutcomeStat[] = [...outcomeMap.entries()]
    .map(([outcome, count]) => ({ outcome, count }))
    .sort((a, b) => b.count - a.count);

  const recent = [...calls]
    .sort((a, b) => b.call_date.localeCompare(a.call_date))
    .slice(0, 5);

  return {
    totalCalls,
    avgPmf,
    closedPoCount,
    pipelineValueCad,
    reachRatePct,
    fitBreakdown,
    byChannel,
    byOutcome,
    recent,
  };
}

export type TagCloudItem = { tag: string; count: number };

export function tagCloud(calls: CallRow[]): TagCloudItem[] {
  const counts = new Map<string, number>();
  for (const call of calls) {
    for (const tag of call.objection_tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Map playbook keys to modal feedback tags for “Seen in calls” badges. */
export const PLAYBOOK_TAG_MATCH: Record<'budget' | 'margin', string> = {
  budget: 'Pre-booked budget',
  margin: 'Wants higher margin',
};
