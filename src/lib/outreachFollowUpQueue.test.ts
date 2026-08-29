import { describe, expect, it } from 'vitest';
import { aggregateProspectOutreachEngagement } from '@/lib/outreachEngagementAggregate';
import { evaluateLeadState } from '@/lib/outreachLeadState';
import { OUTREACH_LEAD_RULES } from '@/lib/outreachLeadRules';
import type { OutreachLeadRow } from '@/lib/outreachLeadLists';
import {
  FOLLOW_UP_QUEUE_VISIBLE,
  buildFollowUpQueue,
  canGenerateFollowUpEmail,
  lastClickedCatalogItemIdFromMessages,
  lastEngagedCatalogItemIdFromMessages,
  resolveFollowUpProductId,
} from '@/lib/outreachFollowUpQueue';

const PRODUCT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRODUCT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const asOf = new Date('2026-08-10T12:00:00Z');

function leadFromMessages(
  prospectId: number,
  name: string,
  messages: Parameters<typeof aggregateProspectOutreachEngagement>[0]['messages'],
  extras?: {
    followUpDue?: boolean;
    followUpOverdueDays?: number;
    lastCallAtToday?: string;
    accountStatus?: OutreachLeadRow['accountStatus'];
    reply?: boolean;
    lastReplyAt?: string;
  },
): OutreachLeadRow {
  const engagement = aggregateProspectOutreachEngagement({
    prospectId,
    messages,
    reply: extras?.reply
      ? {
          attributed: true,
          confidence: 'confirmed_link_after_send',
          lastMessageAt: extras.lastReplyAt ?? '2026-08-10T08:00:00Z',
        }
      : undefined,
  });
  const evaluated = evaluateLeadState({
    engagement,
    followUpDue: extras?.followUpDue
      ? { due: true, overdueDays: extras.followUpOverdueDays ?? 0 }
      : { due: false, overdueDays: 0 },
    asOf,
    rules: OUTREACH_LEAD_RULES,
  });
  return {
    prospectId,
    prospectName: name,
    accountStatus: extras?.accountStatus ?? 'prospect',
    leadState: evaluated.leadState,
    callToday: evaluated.callToday,
    callTodayReasons: evaluated.callTodayReasons,
    score: evaluated.score,
    rulesVersion: evaluated.rulesVersion,
    engagement,
    lastEngagedCatalogItemId: lastEngagedCatalogItemIdFromMessages(messages),
    emailsSentInWindow: messages.filter(
      (m) => m.sent_at != null && m.sent_at >= '2026-07-27T12:00:00Z',
    ).length,
    followUpOverdueDays: extras?.followUpOverdueDays ?? null,
    lastCallAtToday: extras?.lastCallAtToday ?? null,
  };
}

const warmClick = leadFromMessages(1, 'Warm Click Shop', [
  {
    id: '1',
    prospect_id: 1,
    to_email: 'a@example.com',
    catalog_item_id: PRODUCT_A,
    sent_at: '2026-08-08T00:00:00Z',
    open_count: 1,
    click_count: 1,
    last_opened_at: '2026-08-09T00:00:00Z',
    last_clicked_at: '2026-08-09T00:00:00Z',
    bounced_at: null,
    complained_at: null,
    status: 'sent',
  },
]);

const hotLead = leadFromMessages(2, 'Hot Multi Shop', [
  {
    id: '1',
    prospect_id: 2,
    to_email: 'b@example.com',
    catalog_item_id: PRODUCT_A,
    sent_at: '2026-08-07T00:00:00Z',
    open_count: 1,
    click_count: 1,
    last_opened_at: '2026-08-09T00:00:00Z',
    last_clicked_at: '2026-08-09T12:00:00Z',
    bounced_at: null,
    complained_at: null,
    status: 'sent',
  },
  {
    id: '2',
    prospect_id: 2,
    to_email: 'b@example.com',
    catalog_item_id: PRODUCT_B,
    sent_at: '2026-08-06T00:00:00Z',
    open_count: 1,
    click_count: 1,
    last_opened_at: '2026-08-08T00:00:00Z',
    last_clicked_at: '2026-08-08T00:00:00Z',
    bounced_at: null,
    complained_at: null,
    status: 'sent',
  },
]);

const replyLead = leadFromMessages(
  3,
  'Reply Cafe',
  [
    {
      id: '1',
      prospect_id: 3,
      to_email: 'c@example.com',
      catalog_item_id: PRODUCT_A,
      sent_at: '2026-08-07T00:00:00Z',
      open_count: 1,
      click_count: 0,
      last_opened_at: '2026-08-08T00:00:00Z',
      last_clicked_at: null,
      bounced_at: null,
      complained_at: null,
      status: 'sent',
    },
  ],
  { reply: true, lastReplyAt: '2026-08-10T09:00:00Z' },
);

const followDue = leadFromMessages(
  4,
  'Follow Due Co',
  [
    {
      id: '1',
      prospect_id: 4,
      to_email: 'd@example.com',
      catalog_item_id: PRODUCT_A,
      sent_at: '2026-08-09T00:00:00Z',
      open_count: 0,
      click_count: 0,
      last_opened_at: null,
      last_clicked_at: null,
      bounced_at: null,
      complained_at: null,
      status: 'sent',
    },
  ],
  { followUpDue: true },
);

const warmOpenOnly = leadFromMessages(5, 'Open Only Mart', [
  {
    id: '1',
    prospect_id: 5,
    to_email: 'e@example.com',
    catalog_item_id: PRODUCT_A,
    sent_at: '2026-08-08T00:00:00Z',
    open_count: 2,
    click_count: 0,
    last_opened_at: '2026-08-09T00:00:00Z',
    last_clicked_at: null,
    bounced_at: null,
    complained_at: null,
    status: 'sent',
  },
  {
    id: '2',
    prospect_id: 5,
    to_email: 'e@example.com',
    catalog_item_id: PRODUCT_B,
    sent_at: '2026-08-07T00:00:00Z',
    open_count: 2,
    click_count: 0,
    last_opened_at: '2026-08-08T00:00:00Z',
    last_clicked_at: null,
    bounced_at: null,
    complained_at: null,
    status: 'sent',
  },
  {
    id: '3',
    prospect_id: 5,
    to_email: 'e@example.com',
    catalog_item_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    sent_at: '2026-08-06T00:00:00Z',
    open_count: 1,
    click_count: 0,
    last_opened_at: '2026-08-07T00:00:00Z',
    last_clicked_at: null,
    bounced_at: null,
    complained_at: null,
    status: 'sent',
  },
]);

const coldOpen = leadFromMessages(6, 'Cold Open Kiosk', [
  {
    id: '1',
    prospect_id: 6,
    to_email: 'f@example.com',
    catalog_item_id: PRODUCT_A,
    sent_at: '2026-08-08T00:00:00Z',
    open_count: 1,
    click_count: 0,
    last_opened_at: '2026-08-09T00:00:00Z',
    last_clicked_at: null,
    bounced_at: null,
    complained_at: null,
    status: 'sent',
  },
]);

describe('buildFollowUpQueue', () => {
  it('sorts opens first by last open, then no-open by last send', () => {
    const queue = buildFollowUpQueue({
      leads: [warmClick, hotLead, replyLead, followDue],
      asOf,
      productNamesById: new Map([[PRODUCT_A, 'American Revival']]),
    });
    expect(queue.map((r) => r.prospectName)).toEqual([
      'Hot Multi Shop',
      'Warm Click Shop',
      'Reply Cafe',
      'Follow Due Co',
    ]);
    expect(queue.filter((r) => r.prospectId === 2)).toHaveLength(1);
    expect(queue.find((r) => r.prospectId === 2)?.recommendedAction).toBe('call');
    expect(queue.find((r) => r.prospectId === 1)?.recommendedAction).toBe('email');
    expect(queue.find((r) => r.prospectId === 4)?.lastOpenedAt).toBeNull();
  });

  it('routes Warm click in cooldown to Email and Warm open-only in cooldown to Watch', () => {
    expect(warmClick.leadState).toBe('warm');
    expect(warmOpenOnly.leadState).toBe('warm');
    expect(warmOpenOnly.emailsSentInWindow).toBeGreaterThanOrEqual(1);

    const queue = buildFollowUpQueue({
      leads: [warmClick, warmOpenOnly],
      asOf,
    });
    expect(queue.find((r) => r.prospectId === 1)?.recommendedAction).toBe('email');
    expect(queue.find((r) => r.prospectId === 5)?.recommendedAction).toBe('watch');
  });

  it('routes Cold 7d opens to Watch', () => {
    expect(coldOpen.leadState).toBe('cold');
    const queue = buildFollowUpQueue({ leads: [coldOpen], asOf });
    expect(queue).toEqual([
      expect.objectContaining({
        prospectId: 6,
        recommendedAction: 'watch',
      }),
    ]);
  });

  it('treats pending draft as Email-able even for Warm open-only in cooldown', () => {
    const queue = buildFollowUpQueue({
      leads: [warmOpenOnly],
      pendingProspectIds: new Set([5]),
      asOf,
    });
    expect(queue[0]?.recommendedAction).toBe('email');
  });

  it('excludes active accounts from the queue', () => {
    const activeWithHot = {
      ...hotLead,
      prospectId: 10,
      prospectName: 'Active Hot Shop',
      accountStatus: 'active_account' as const,
    };
    const queue = buildFollowUpQueue({ leads: [activeWithHot, hotLead], asOf });
    expect(queue.some((r) => r.prospectId === 10)).toBe(false);
    expect(queue.some((r) => r.prospectId === 2)).toBe(true);
  });

  it('downgrades Call to watch when already called today without new engagement', () => {
    const called = {
      ...hotLead,
      lastCallAtToday: '2026-08-10T14:00:00Z',
    };
    const queue = buildFollowUpQueue({ leads: [called], asOf });
    expect(queue).toEqual([
      expect.objectContaining({
        prospectId: 2,
        recommendedAction: 'watch',
      }),
    ]);
  });

  it('keeps Call when engagement is newer than today’s call', () => {
    const called = {
      ...hotLead,
      lastCallAtToday: '2026-08-10T08:00:00Z',
      engagement: {
        ...hotLead.engagement,
        lastClickedAt: '2026-08-10T10:00:00Z',
        lastEngagementAt: '2026-08-10T10:00:00Z',
      },
    };
    const queue = buildFollowUpQueue({ leads: [called], asOf });
    expect(queue[0]?.recommendedAction).toBe('call');
  });

  it('ranks overdue follow-up below fresh Hot when overdue has no open', () => {
    const overdue = leadFromMessages(
      7,
      'Overdue Shop',
      [
        {
          id: '1',
          prospect_id: 7,
          to_email: 'g@example.com',
          catalog_item_id: PRODUCT_A,
          sent_at: '2026-08-09T18:00:00Z',
          open_count: 0,
          click_count: 0,
          last_opened_at: null,
          last_clicked_at: null,
          bounced_at: null,
          complained_at: null,
          status: 'sent',
        },
      ],
      {
        followUpDue: true,
        followUpOverdueDays: 5,
      },
    );
    const queue = buildFollowUpQueue({
      leads: [overdue, hotLead],
      asOf,
    });
    expect(queue[0]?.prospectId).toBe(2);
    expect(queue[1]?.prospectId).toBe(7);
    expect(queue[1]?.followUpOverdueDays).toBe(5);
  });

  it('excludes snoozed prospects', () => {
    const queue = buildFollowUpQueue({
      leads: [hotLead],
      snoozedProspectIds: new Set([2]),
      asOf,
    });
    expect(queue).toHaveLength(0);
  });

  it('includes cold emailed accounts with fallback watch when no rule action', () => {
    const coldEmailed = leadFromMessages(8, 'Cold Sent Shop', [
      {
        id: '1',
        prospect_id: 8,
        to_email: 'h@example.com',
        catalog_item_id: PRODUCT_A,
        sent_at: '2026-07-01T00:00:00Z',
        open_count: 0,
        click_count: 0,
        last_opened_at: null,
        last_clicked_at: null,
        bounced_at: null,
        complained_at: null,
        status: 'sent',
      },
    ]);
    expect(coldEmailed.leadState).toBe('cold');
    const queue = buildFollowUpQueue({ leads: [coldEmailed], asOf });
    expect(queue).toEqual([
      expect.objectContaining({
        prospectId: 8,
        recommendedAction: 'watch',
        lastSentAt: '2026-07-01T00:00:00Z',
        lastOpenedAt: null,
      }),
    ]);
  });

  it('excludes sends older than the emailed window', () => {
    const stale = leadFromMessages(9, 'Stale Send Shop', [
      {
        id: '1',
        prospect_id: 9,
        to_email: 'i@example.com',
        catalog_item_id: PRODUCT_A,
        sent_at: '2026-04-01T00:00:00Z',
        open_count: 0,
        click_count: 0,
        last_opened_at: null,
        last_clicked_at: null,
        bounced_at: null,
        complained_at: null,
        status: 'sent',
      },
    ]);
    const queue = buildFollowUpQueue({ leads: [stale, hotLead], asOf });
    expect(queue.map((r) => r.prospectId)).toEqual([2]);
  });

  it('sorts no-open rows by lastSentAt descending', () => {
    const olderSend = leadFromMessages(11, 'Older Send Co', [
      {
        id: '1',
        prospect_id: 11,
        to_email: 'j@example.com',
        catalog_item_id: PRODUCT_A,
        sent_at: '2026-07-01T00:00:00Z',
        open_count: 0,
        click_count: 0,
        last_opened_at: null,
        last_clicked_at: null,
        bounced_at: null,
        complained_at: null,
        status: 'sent',
      },
    ]);
    const newerSend = leadFromMessages(12, 'Newer Send Co', [
      {
        id: '1',
        prospect_id: 12,
        to_email: 'k@example.com',
        catalog_item_id: PRODUCT_A,
        sent_at: '2026-08-01T00:00:00Z',
        open_count: 0,
        click_count: 0,
        last_opened_at: null,
        last_clicked_at: null,
        bounced_at: null,
        complained_at: null,
        status: 'sent',
      },
    ]);
    const queue = buildFollowUpQueue({ leads: [olderSend, newerSend], asOf });
    expect(queue.map((r) => r.prospectId)).toEqual([12, 11]);
  });

  it('includes talk track hint on Call rows', () => {
    const queue = buildFollowUpQueue({
      leads: [hotLead],
      asOf,
      productNamesById: new Map([[PRODUCT_A, 'American Revival']]),
    });
    expect(queue[0]?.talkTrackHint).toMatch(/clicked American Revival/i);
  });

  it('uses a 15-row visible scroll viewport', () => {
    expect(FOLLOW_UP_QUEUE_VISIBLE).toBe(15);
  });
});

describe('follow-up generate guards', () => {
  it('allows cooldown when click or reply is in window and only one send', () => {
    expect(
      canGenerateFollowUpEmail({
        inCooldown: true,
        clickOrReplyInWindow: true,
        emailsSentInWindow: 1,
        hasPendingDraft: false,
      }).ok,
    ).toBe(true);
  });

  it('rejects open-only cooldown without pending draft', () => {
    const result = canGenerateFollowUpEmail({
      inCooldown: true,
      clickOrReplyInWindow: false,
      emailsSentInWindow: 1,
      hasPendingDraft: false,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a second send in the window', () => {
    const result = canGenerateFollowUpEmail({
      inCooldown: true,
      clickOrReplyInWindow: true,
      emailsSentInWindow: 2,
      hasPendingDraft: false,
    });
    expect(result.ok).toBe(false);
  });

  it('reuses pending even after two sends', () => {
    expect(
      canGenerateFollowUpEmail({
        inCooldown: true,
        clickOrReplyInWindow: false,
        emailsSentInWindow: 2,
        hasPendingDraft: true,
      }).ok,
    ).toBe(true);
  });
});

describe('product pick helpers', () => {
  it('prefers last engaged click catalog id', () => {
    expect(
      lastClickedCatalogItemIdFromMessages([
        {
          id: '1',
          prospect_id: 1,
          to_email: 'a@example.com',
          catalog_item_id: PRODUCT_A,
          sent_at: '2026-08-01T00:00:00Z',
          open_count: 1,
          click_count: 1,
          last_opened_at: '2026-08-09T00:00:00Z',
          last_clicked_at: '2026-08-08T00:00:00Z',
          bounced_at: null,
          complained_at: null,
        },
        {
          id: '2',
          prospect_id: 1,
          to_email: 'a@example.com',
          catalog_item_id: PRODUCT_B,
          sent_at: '2026-08-02T00:00:00Z',
          open_count: 1,
          click_count: 2,
          last_opened_at: '2026-08-09T00:00:00Z',
          last_clicked_at: '2026-08-09T12:00:00Z',
          bounced_at: null,
          complained_at: null,
        },
      ]),
    ).toBe(PRODUCT_B);
  });

  it('bumps last clicked SKU when the pool pick is empty', () => {
    expect(
      resolveFollowUpProductId({
        selectedCatalogItemId: null,
        lastClickedCatalogItemId: PRODUCT_A,
        lastSentCatalogItemId: PRODUCT_B,
      }),
    ).toEqual({ catalogItemId: PRODUCT_A, bumped: true });
  });
});
