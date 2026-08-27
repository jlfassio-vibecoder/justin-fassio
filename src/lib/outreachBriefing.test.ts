import { describe, expect, it } from 'vitest';
import { formatRegionalPoolMessage } from '@/lib/outreachBriefingShared';
import { prepBannerMessage } from '@/lib/outreachBriefing';
import type { OutreachPoolDiagnostics } from '@/lib/outreachBriefingShared';
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
    operationalTerritoryId: null,
    storeTerritoryCode: null,
    crmRegion: null,
    prepCity: null,
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

  it('open_batch_full tells staff to finish pending drafts', () => {
    const b = prepBannerMessage({
      sellingDate: '2026-08-13',
      run: run({
        kind: 'manual_regional_prep',
        reason: 'open_batch_full',
        pendingBefore: 25,
        producedCount: 0,
      }),
    });
    expect(b.message).toContain('25 pending drafts still open');
    expect(b.message).toContain('before running prep again');
  });

  it('empty_pool includes shortfall', () => {
    const b = prepBannerMessage({
      sellingDate: '2026-08-13',
      run: run({ status: 'empty_pool', shortfall: 4, producedCount: 0 }),
    });
    expect(b.message).toContain('shortfall 4');
  });

  it('regional identified-only success', () => {
    const b = prepBannerMessage({
      sellingDate: '2026-08-13',
      run: run({
        kind: 'manual_regional_prep',
        selectedCount: 25,
        producedCount: 0,
      }),
    });
    expect(b.message).toContain('25 accounts identified');
    expect(b.message).toContain('research emails');
  });

  it('formatRegionalPoolMessage explains directory vs sendable gap', () => {
    const pool: OutreachPoolDiagnostics = {
      inRegion: 35,
      withUsableEmail: 3,
      sendableNow: 2,
      queuedWithoutEmail: 23,
      excluded: {
        noUsableEmail: 0,
        pendingDraft: 1,
        cooldown: 2,
        contactSuppressed: 0,
        noProduct: 0,
        other: 0,
      },
    };
    const msg = formatRegionalPoolMessage(pool, 'Oregon Coast');
    expect(msg).toContain('35 in Oregon Coast');
    expect(msg).toContain('23 queued — research email next');
    expect(msg).toContain('25 selected for outreach');
  });
});
