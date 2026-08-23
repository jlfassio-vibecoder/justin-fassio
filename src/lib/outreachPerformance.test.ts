import { describe, expect, it } from 'vitest';
import { buildOutreachPerformanceReport, fitBandKey } from '@/lib/outreachPerformance';

describe('fitBandKey', () => {
  it('buckets fit scores', () => {
    expect(fitBandKey(9)).toBe('8-10');
    expect(fitBandKey(6.5)).toBe('6-7');
    expect(fitBandKey(3)).toBe('1-5');
    expect(fitBandKey(null)).toBe('unknown');
  });
});

describe('buildOutreachPerformanceReport', () => {
  it('excludes unattributed converts from learned numerators', () => {
    const report = buildOutreachPerformanceReport({
      lookbackDays: 90,
      minAttributedConversions: 8,
      attributedRows: [
        {
          attribution_model: 'none',
          attributed_system_message_id: null,
          primary_channel: 'golf_retail',
          catalog_item_id: 'p1',
          fit_score: 9,
          lead_state: 'hot',
        },
        {
          attribution_model: 'staff_confirmed',
          attributed_system_message_id: 'm1',
          primary_channel: 'golf_retail',
          catalog_item_id: 'p1',
          fit_score: 9,
          lead_state: 'hot',
          lead_score: 12,
          snapshot: {
            engagement: { openCount: 1, clickCount: 2, replyAttributed: false, emailsSent: 2 },
          },
        },
      ],
      sendRows: [
        {
          catalog_item_id: 'p1',
          primary_channel: 'golf_retail',
          fit_score: 9,
          lead_state_at_send: 'warm',
        },
        {
          catalog_item_id: 'p1',
          primary_channel: 'golf_retail',
          fit_score: 9,
          lead_state_at_send: 'hot',
        },
      ],
    });

    const golf = report.byChannel.find((s) => s.key === 'golf_retail');
    expect(golf?.attributedConversions).toBe(1);
    expect(golf?.sends).toBe(2);

    const hot = report.byLeadState.find((s) => s.key === 'hot');
    expect(hot?.attributedConversions).toBe(1);
    expect(hot?.sends).toBe(1);

    const warm = report.byLeadState.find((s) => s.key === 'warm');
    expect(warm?.sends).toBe(1);

    expect(report.attributionCohort.rows).toHaveLength(1);
    expect(report.attributionCohort.rows[0]?.leadScore).toBe(12);
  });
});
