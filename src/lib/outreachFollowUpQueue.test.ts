import { describe, expect, it } from 'vitest';
import { aggregateProspectOutreachEngagement } from '@/lib/outreachEngagementAggregate';
import { evaluateLeadState } from '@/lib/outreachLeadState';
import { OUTREACH_LEAD_RULES } from '@/lib/outreachLeadRules';
import type { OutreachLeadRow } from '@/lib/outreachLeadLists';
import {
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
  extras?: { followUpDue?: boolean; reply?: boolean; lastReplyAt?: string },
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
    followUpDue: extras?.followUpDue,
    asOf,
    rules: OUTREACH_LEAD_RULES,
  });
  return {
    prospectId,
    prospectName: name,
    accountStatus: 'prospect',
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

const followDue = leadFromMessages(4, 'Follow Due Co', [], { followUpDue: true });

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
  it('ranks reply before Hot, and does not duplicate Hot as a second list item', () => {
    const queue = buildFollowUpQueue({
      leads: [warmClick, hotLead, replyLead, followDue],
      asOf,
      productNamesById: new Map([[PRODUCT_A, 'American Revival']]),
    });
    expect(queue.map((r) => r.prospectName)).toEqual([
      'Reply Cafe',
      'Hot Multi Shop',
      'Follow Due Co',
      'Warm Click Shop',
    ]);
    expect(queue.filter((r) => r.prospectId === 2)).toHaveLength(1);
    expect(queue.find((r) => r.prospectId === 2)?.recommendedAction).toBe('call');
    expect(queue.find((r) => r.prospectId === 1)?.recommendedAction).toBe('email');
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
