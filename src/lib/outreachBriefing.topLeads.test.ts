import { describe, expect, it } from 'vitest';
import {
  prepareBriefingLeadLists,
  prepareRecentEngagementForBriefing,
} from '@/lib/outreachBriefing';
import type { OutreachLeadRow } from '@/lib/outreachLeadLists';
import { OUTREACH_LEAD_RULES } from '@/lib/outreachLeadRules';

function stubLead(
  prospectId: number,
  name: string,
  extras: Partial<OutreachLeadRow> & {
    leadState?: OutreachLeadRow['leadState'];
    callToday?: boolean;
    score?: number;
  } = {},
): OutreachLeadRow {
  return {
    prospectId,
    prospectName: name,
    accountStatus: 'prospect',
    leadState: extras.leadState ?? 'warm',
    callToday: extras.callToday ?? false,
    callTodayReasons: extras.callTodayReasons ?? [],
    score: extras.score ?? 5,
    rulesVersion: OUTREACH_LEAD_RULES.version,
    engagement: {
      prospectId,
      emailsSent: 1,
      lastSentAt: null,
      openCount: 1,
      clickCount: 0,
      messagesOpened: 1,
      messagesClicked: 0,
      distinctProductsOpened: 1,
      distinctProductsClicked: 0,
      maxClickCountOnMessage: 0,
      lastOpenedAt: null,
      lastClickedAt: null,
      lastEngagementAt: null,
      suppressed: false,
      reply: { attributed: false, confidence: 'none', lastMessageAt: null },
      unlinkedManualIncluded: 0,
    },
    lastEngagedCatalogItemId: null,
    emailsSentInWindow: 1,
    followUpOverdueDays: null,
    lastCallAtToday: null,
    ...extras,
  };
}

describe('prepareBriefingLeadLists', () => {
  it('excludes snoozed leads and sorts by score then name', () => {
    const leads = [
      stubLead(1, 'Beta', {
        leadState: 'hot',
        callToday: true,
        score: 8,
        callTodayReasons: ['hot_intent'],
      }),
      stubLead(2, 'Alpha', {
        leadState: 'hot',
        callToday: true,
        score: 10,
        callTodayReasons: ['hot_intent'],
      }),
      stubLead(3, 'Warm Only', { leadState: 'warm', callToday: false, score: 4 }),
      stubLead(4, 'Snoozed Hot', {
        leadState: 'hot',
        callToday: true,
        score: 99,
        callTodayReasons: ['hot_intent'],
      }),
    ];
    const result = prepareBriefingLeadLists({
      leads,
      snoozedProspectIds: new Set([4]),
    });
    expect(result.callToday.map((l) => l.prospectId)).toEqual([2, 1]);
    expect(result.hot.map((l) => l.prospectId)).toEqual([2, 1]);
    expect(result.warm.map((l) => l.prospectId)).toEqual([3]);
    expect(result.callToday.find((l) => l.prospectId === 4)).toBeUndefined();
  });

  it('caps lists at the given limit', () => {
    const leads = Array.from({ length: 15 }, (_, i) =>
      stubLead(i + 1, `Lead ${String(i + 1).padStart(2, '0')}`, {
        leadState: 'warm',
        callToday: false,
        score: 15 - i,
      }),
    );
    const result = prepareBriefingLeadLists({
      leads,
      snoozedProspectIds: new Set(),
      limit: 5,
    });
    expect(result.warm).toHaveLength(5);
    expect(result.warm[0]?.prospectId).toBe(1);
  });
});

describe('prepareRecentEngagementForBriefing', () => {
  it('excludes Call today / Warm ids and caps by recency', () => {
    const rows = [
      {
        prospectId: 1,
        prospectName: 'Keep',
        lastEngagedAt: '2026-08-28T12:00:00Z',
        openCount: 1,
        clickCount: 0,
      },
      {
        prospectId: 2,
        prospectName: 'CallToday',
        lastEngagedAt: '2026-08-29T12:00:00Z',
        openCount: 2,
        clickCount: 1,
      },
      {
        prospectId: 3,
        prospectName: 'Older',
        lastEngagedAt: '2026-08-27T12:00:00Z',
        openCount: 1,
        clickCount: 0,
      },
    ];
    const prepared = prepareRecentEngagementForBriefing({
      rows,
      excludeProspectIds: new Set([2]),
      limit: 10,
    });
    expect(prepared.map((r) => r.prospectId)).toEqual([1, 3]);
  });
});
