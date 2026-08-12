import { describe, expect, it } from 'vitest';
import { prepBannerMessage } from '@/lib/outreachBriefing';
import type { OutreachAutomationRunRow } from '@/lib/outreachNightlyPrep';

function run(partial: Partial<OutreachAutomationRunRow>): OutreachAutomationRunRow {
  return {
    id: 'r1',
    runDate: '2026-08-13',
    kind: 'nightly_prep',
    status: 'succeeded',
    trigger: 'cron',
    capacity: 5,
    pendingBefore: 0,
    netCapacity: 5,
    selectedCount: 5,
    producedCount: 5,
    skippedCount: 0,
    failedCount: 0,
    shortfall: 0,
    channelAllocation: { channelOrder: [], slotsByChannel: {} },
    error: null,
    targetErrors: [],
    reason: null,
    startedAt: '2026-08-12T05:00:00.000Z',
    finishedAt: '2026-08-12T05:01:00.000Z',
    triggeredBy: null,
    ...partial,
  };
}

describe('prepBannerMessage', () => {
  it('missing run', () => {
    const b = prepBannerMessage({ sellingDate: '2026-08-13', run: null });
    expect(b.status).toBe('missing');
    expect(b.message).toContain('Run prep now');
  });

  it('succeeded with drafts', () => {
    const b = prepBannerMessage({
      sellingDate: '2026-08-13',
      run: run({ producedCount: 3 }),
    });
    expect(b.message).toBe('3 drafts ready for 2026-08-13.');
  });

  it('already_at_pace', () => {
    const b = prepBannerMessage({
      sellingDate: '2026-08-13',
      run: run({ reason: 'already_at_pace', producedCount: 0 }),
    });
    expect(b.message).toContain('already meet');
  });

  it('empty_pool includes shortfall', () => {
    const b = prepBannerMessage({
      sellingDate: '2026-08-13',
      run: run({ status: 'empty_pool', shortfall: 4, producedCount: 0 }),
    });
    expect(b.message).toContain('shortfall 4');
  });
});
