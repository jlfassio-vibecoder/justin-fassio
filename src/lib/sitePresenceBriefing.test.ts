import { describe, expect, it } from 'vitest';
import { mergeSitePresenceIntoCallToday } from '@/lib/sitePresenceBriefing';
import type { OutreachLeadRow } from '@/lib/outreachLeadLists';
import { OUTREACH_LEAD_RULES } from '@/lib/outreachLeadRules';

function stubLead(
  prospectId: number,
  name: string,
  extras: Partial<OutreachLeadRow> = {},
): OutreachLeadRow {
  return {
    prospectId,
    prospectName: name,
    accountStatus: 'prospect',
    leadState: 'hot',
    callToday: true,
    callTodayReasons: ['hot_intent'],
    score: 12,
    rulesVersion: OUTREACH_LEAD_RULES.version,
    engagement: {
      prospectId,
      emailsSent: 1,
      lastSentAt: null,
      openCount: 0,
      clickCount: 1,
      messagesOpened: 0,
      messagesClicked: 1,
      distinctProductsOpened: 0,
      distinctProductsClicked: 1,
      maxClickCountOnMessage: 1,
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

describe('mergeSitePresenceIntoCallToday', () => {
  it('pins active presence onto existing Call today with on_site', () => {
    const callToday = [stubLead(1, 'Hot Shop')];
    const merged = mergeSitePresenceIntoCallToday({
      callToday,
      allLeads: callToday,
      presence: [
        {
          prospectId: 1,
          lastSeenAt: '2026-08-30T12:00:00Z',
          lastPath: '/old-guys-rule-wholesale',
          active: true,
        },
      ],
      prospectNames: new Map([[1, 'Hot Shop']]),
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.callTodayReasons[0]).toBe('on_site');
    expect(merged[0]?.sitePresence?.active).toBe(true);
  });

  it('adds a synthetic Call today row for active presence-only prospects', () => {
    const merged = mergeSitePresenceIntoCallToday({
      callToday: [],
      allLeads: [],
      presence: [
        {
          prospectId: 99,
          lastSeenAt: '2026-08-30T12:00:00Z',
          lastPath: '/',
          active: true,
        },
      ],
      prospectNames: new Map([[99, 'Walk-in Buyer']]),
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.prospectId).toBe(99);
    expect(merged[0]?.prospectName).toBe('Walk-in Buyer');
    expect(merged[0]?.callTodayReasons).toEqual(['on_site']);
  });
});
