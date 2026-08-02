import { describe, expect, it } from 'vitest';
import {
  filterCalls,
  summarizeDashboard,
  tagCloud,
} from '@/lib/callAggregates';
import type { CallRow } from '@/lib/calls';
import type { Prospect } from '@/lib/prospects';

const FIXTURE_PROSPECTS: Prospect[] = [
  {
    id: 1,
    name: 'Kelowna Golf & Country Club',
    category: 'Golf',
    region: 'Okanagan',
    city: 'Kelowna',
    address: '1297 Glenmore Dr',
    phone: '250-762-2531',
    fit: 'Test golf fit',
  },
  {
    id: 8,
    name: 'Penticton Yacht Club and Marina',
    category: 'Marina',
    region: 'Okanagan',
    city: 'Penticton',
    address: '1 Harbour',
    phone: '250-000-0000',
    fit: 'Test marina fit',
  },
];

function call(partial: Partial<CallRow> & Pick<CallRow, 'id' | 'prospect_id' | 'outcome'>): CallRow {
  return {
    contact_name: null,
    pmf_score: null,
    order_value_cad: 0,
    call_date: '2026-08-01',
    notes: null,
    objection_tags: [],
    ...partial,
  };
}

describe('filterCalls', () => {
  const rows = [
    call({
      id: '1',
      prospect_id: 1,
      outcome: 'Closed PO / Written Order',
      contact_name: 'Dave',
      notes: 'Spring book',
      pmf_score: 10,
    }),
    call({
      id: '2',
      prospect_id: 8,
      outcome: 'Left Message / Gatekeeper',
      contact_name: 'Sam',
      pmf_score: 3,
    }),
  ];

  it('filters by search across store, contact, notes, outcome', () => {
    expect(
      filterCalls(
        rows,
        {
          search: 'kelowna',
          channel: 'All Retail Channels',
          outcome: 'All Call Outcomes',
        },
        FIXTURE_PROSPECTS,
      ),
    ).toHaveLength(1);
    expect(
      filterCalls(
        rows,
        {
          search: 'gatekeeper',
          channel: 'All Retail Channels',
          outcome: 'All Call Outcomes',
        },
        FIXTURE_PROSPECTS,
      )[0]?.id,
    ).toBe('2');
  });

  it('filters by channel category', () => {
    const golf = filterCalls(
      rows,
      {
        search: '',
        channel: 'Golf Pro Shops',
        outcome: 'All Call Outcomes',
      },
      FIXTURE_PROSPECTS,
    );
    expect(golf.map((c) => c.id)).toEqual(['1']);
    const marina = filterCalls(
      rows,
      {
        search: '',
        channel: 'Marinas',
        outcome: 'All Call Outcomes',
      },
      FIXTURE_PROSPECTS,
    );
    expect(marina.map((c) => c.id)).toEqual(['2']);
  });

  it('filters by outcome substring', () => {
    const closed = filterCalls(
      rows,
      {
        search: '',
        channel: 'All Retail Channels',
        outcome: 'Closed PO',
      },
      FIXTURE_PROSPECTS,
    );
    expect(closed).toHaveLength(1);
    expect(closed[0]?.outcome).toContain('Closed PO');
  });
});

describe('summarizeDashboard', () => {
  const rows = [
    call({
      id: '1',
      prospect_id: 1,
      outcome: 'Closed PO / Written Order',
      pmf_score: 10,
      order_value_cad: 500,
      call_date: '2026-08-02',
    }),
    call({
      id: '2',
      prospect_id: 1,
      outcome: 'Follow-up Scheduled',
      pmf_score: 6,
      order_value_cad: 100,
      call_date: '2026-08-01',
    }),
    call({
      id: '3',
      prospect_id: 1,
      outcome: 'Left Message / Gatekeeper',
      pmf_score: 2,
      order_value_cad: 0,
      call_date: '2026-07-30',
    }),
  ];

  it('computes totals, avg PMF, closed PO, pipeline, fit buckets', () => {
    const s = summarizeDashboard(rows, FIXTURE_PROSPECTS);
    expect(s.totalCalls).toBe(3);
    expect(s.avgPmf).toBe(6);
    expect(s.closedPoCount).toBe(1);
    expect(s.pipelineValueCad).toBe(600);
    expect(s.reachRatePct).toBe(67);
    expect(s.fitBreakdown[0]?.pct).toBe(33);
    expect(s.fitBreakdown[1]?.pct).toBe(33);
    expect(s.fitBreakdown[2]?.pct).toBe(33);
    expect(s.byChannel[0]?.category).toBe('Golf');
    expect(s.byOutcome[0]?.count).toBeGreaterThanOrEqual(1);
    expect(s.recent[0]?.id).toBe('1');
  });

  it('returns empty-safe zeros when no calls', () => {
    const s = summarizeDashboard([]);
    expect(s.totalCalls).toBe(0);
    expect(s.avgPmf).toBeNull();
    expect(s.reachRatePct).toBeNull();
    expect(s.fitBreakdown.every((b) => b.pct === 0)).toBe(true);
  });
});

describe('tagCloud', () => {
  it('counts and sorts tags by frequency', () => {
    const cloud = tagCloud([
      call({
        id: '1',
        prospect_id: 1,
        outcome: 'Follow-up Scheduled',
        objection_tags: ['Loves display rack', 'Pre-booked budget'],
      }),
      call({
        id: '2',
        prospect_id: 1,
        outcome: 'Follow-up Scheduled',
        objection_tags: ['Loves display rack'],
      }),
    ]);
    expect(cloud[0]).toEqual({ tag: 'Loves display rack', count: 2 });
    expect(cloud[1]).toEqual({ tag: 'Pre-booked budget', count: 1 });
  });
});
