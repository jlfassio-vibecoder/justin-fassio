import { describe, expect, it, vi } from 'vitest';
import {
  aggregateProspectOutreachEngagement,
  anyMessageRecipientSuppressed,
  attributeConfirmedReply,
  type OutreachMessageRow,
} from '@/lib/outreachEngagementAggregate';
import { evaluateLeadState, scoreProspectEngagement } from '@/lib/outreachLeadState';
import { OUTREACH_LEAD_RULES } from '@/lib/outreachLeadRules';

vi.mock('@/lib/systemMessages', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/systemMessages')>();
  return {
    ...actual,
    markProductEngagementSeen: vi.fn(async () => {
      throw new Error('evaluateLeadState must not write engagement_seen');
    }),
  };
});

const PRODUCT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRODUCT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRODUCT_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function msg(
  partial: Partial<OutreachMessageRow> & Pick<OutreachMessageRow, 'id'>,
): OutreachMessageRow {
  return {
    prospect_id: 1,
    to_email: 'buyer@example.com',
    catalog_item_id: PRODUCT_A,
    sent_at: '2026-08-01T12:00:00Z',
    open_count: 0,
    click_count: 0,
    last_opened_at: null,
    last_clicked_at: null,
    bounced_at: null,
    complained_at: null,
    status: 'sent',
    account_contact_id: null,
    ...partial,
  };
}

describe('aggregateProspectOutreachEngagement', () => {
  it('sums opens/clicks across messages for one prospect', () => {
    const engagement = aggregateProspectOutreachEngagement({
      prospectId: 1,
      messages: [
        msg({
          id: '1',
          open_count: 2,
          click_count: 1,
          last_opened_at: '2026-08-02T00:00:00Z',
          last_clicked_at: '2026-08-02T01:00:00Z',
        }),
        msg({
          id: '2',
          catalog_item_id: PRODUCT_B,
          open_count: 1,
          click_count: 0,
          last_opened_at: '2026-08-03T00:00:00Z',
        }),
      ],
      unlinkedManualIncluded: 1,
    });

    expect(engagement.emailsSent).toBe(2);
    expect(engagement.openCount).toBe(3);
    expect(engagement.clickCount).toBe(1);
    expect(engagement.messagesOpened).toBe(2);
    expect(engagement.messagesClicked).toBe(1);
    expect(engagement.distinctProductsOpened).toBe(2);
    expect(engagement.distinctProductsClicked).toBe(1);
    expect(engagement.unlinkedManualIncluded).toBe(1);
    expect(engagement.lastEngagementAt).toBe('2026-08-03T00:00:00Z');
  });

  it('detects suppression from bounce/complaint on any row', () => {
    expect(
      anyMessageRecipientSuppressed([msg({ id: '1', bounced_at: '2026-08-01T00:00:00Z' })]),
    ).toBe(true);
    expect(anyMessageRecipientSuppressed([msg({ id: '1', status: 'complained' })])).toBe(true);
    expect(anyMessageRecipientSuppressed([msg({ id: '1' })])).toBe(false);
  });
});

describe('attributeConfirmedReply', () => {
  it('does not count unlinked or suggested threads', () => {
    const messages = [
      msg({
        id: '1',
        to_email: 'buyer@example.com',
        sent_at: '2026-08-01T00:00:00Z',
      }),
    ];
    expect(
      attributeConfirmedReply({
        messages,
        confirmedLinks: [
          {
            link_status: 'suggested',
            participants: ['buyer@example.com'],
            account_contact_id: null,
            last_message_at: '2026-08-05T00:00:00Z',
          },
        ],
      }).attributed,
    ).toBe(false);
  });

  it('attributes confirmed link after send when participant matches', () => {
    const result = attributeConfirmedReply({
      messages: [
        msg({
          id: '1',
          to_email: 'Buyer@Example.com',
          sent_at: '2026-08-01T00:00:00Z',
        }),
      ],
      confirmedLinks: [
        {
          link_status: 'confirmed',
          participants: ['buyer@example.com'],
          account_contact_id: null,
          last_message_at: '2026-08-05T00:00:00Z',
        },
      ],
    });
    expect(result.attributed).toBe(true);
    expect(result.confidence).toBe('confirmed_link_after_send');
  });
});

describe('evaluateLeadState', () => {
  const asOf = new Date('2026-08-10T12:00:00Z');

  it('click-heavy timeline → Hot; open-only → not Hot', () => {
    const clickHeavy = aggregateProspectOutreachEngagement({
      prospectId: 1,
      messages: [
        msg({
          id: '1',
          catalog_item_id: PRODUCT_A,
          open_count: 1,
          click_count: 1,
          last_clicked_at: '2026-08-09T00:00:00Z',
          last_opened_at: '2026-08-09T00:00:00Z',
        }),
        msg({
          id: '2',
          catalog_item_id: PRODUCT_B,
          open_count: 1,
          click_count: 1,
          last_clicked_at: '2026-08-08T00:00:00Z',
          last_opened_at: '2026-08-08T00:00:00Z',
        }),
      ],
    });
    // 2 clicked products = 10 + multi-product = 14
    expect(scoreProspectEngagement(clickHeavy)).toBeGreaterThanOrEqual(
      OUTREACH_LEAD_RULES.hotScoreMin,
    );
    const hot = evaluateLeadState({ engagement: clickHeavy, asOf });
    expect(hot.leadState).toBe('hot');
    expect(hot.callToday).toBe(true);
    expect(hot.callTodayReasons).toContain('hot_intent');

    const openOnly = aggregateProspectOutreachEngagement({
      prospectId: 1,
      messages: [
        msg({
          id: '1',
          catalog_item_id: PRODUCT_A,
          open_count: 5,
          click_count: 0,
          last_opened_at: '2026-08-09T00:00:00Z',
        }),
        msg({
          id: '2',
          catalog_item_id: PRODUCT_B,
          open_count: 3,
          click_count: 0,
          last_opened_at: '2026-08-08T00:00:00Z',
        }),
        msg({
          id: '3',
          catalog_item_id: PRODUCT_C,
          open_count: 2,
          click_count: 0,
          last_opened_at: '2026-08-07T00:00:00Z',
        }),
      ],
    });
    const openEval = evaluateLeadState({ engagement: openOnly, asOf });
    expect(openEval.leadState).not.toBe('hot');
  });

  it('multi-product clicks escalate toward Hot', () => {
    const oneClick = aggregateProspectOutreachEngagement({
      prospectId: 1,
      messages: [
        msg({
          id: '1',
          click_count: 1,
          open_count: 1,
          last_clicked_at: '2026-08-09T00:00:00Z',
        }),
      ],
    });
    const twoClicks = aggregateProspectOutreachEngagement({
      prospectId: 1,
      messages: [
        msg({
          id: '1',
          catalog_item_id: PRODUCT_A,
          click_count: 1,
          open_count: 1,
          last_clicked_at: '2026-08-09T00:00:00Z',
        }),
        msg({
          id: '2',
          catalog_item_id: PRODUCT_B,
          click_count: 1,
          open_count: 1,
          last_clicked_at: '2026-08-09T00:00:00Z',
        }),
      ],
    });
    expect(scoreProspectEngagement(twoClicks)).toBeGreaterThan(scoreProspectEngagement(oneClick));
    expect(evaluateLeadState({ engagement: twoClicks, asOf }).leadState).toBe('hot');
  });

  it('age > 21 days → Cold', () => {
    const aged = aggregateProspectOutreachEngagement({
      prospectId: 1,
      messages: [
        msg({
          id: '1',
          catalog_item_id: PRODUCT_A,
          click_count: 2,
          open_count: 1,
          last_clicked_at: '2026-07-01T00:00:00Z',
        }),
        msg({
          id: '2',
          catalog_item_id: PRODUCT_B,
          click_count: 1,
          open_count: 1,
          last_clicked_at: '2026-07-01T00:00:00Z',
        }),
      ],
    });
    const result = evaluateLeadState({ engagement: aged, asOf });
    expect(result.agedOut).toBe(true);
    expect(result.leadState).toBe('cold');
  });

  it('does not call markProductEngagementSeen / write counters', async () => {
    const { markProductEngagementSeen } = await import('@/lib/systemMessages');
    const engagement = aggregateProspectOutreachEngagement({
      prospectId: 1,
      messages: [msg({ id: '1', open_count: 1, last_opened_at: '2026-08-09T00:00:00Z' })],
    });
    evaluateLeadState({ engagement, asOf });
    expect(markProductEngagementSeen).not.toHaveBeenCalled();
  });

  it('suppressed contacts excluded from Call Today', () => {
    const engagement = aggregateProspectOutreachEngagement({
      prospectId: 1,
      messages: [
        msg({
          id: '1',
          catalog_item_id: PRODUCT_A,
          click_count: 1,
          open_count: 1,
          last_clicked_at: '2026-08-09T00:00:00Z',
        }),
        msg({
          id: '2',
          catalog_item_id: PRODUCT_B,
          click_count: 1,
          open_count: 1,
          last_clicked_at: '2026-08-09T00:00:00Z',
        }),
      ],
      suppressed: true,
    });
    const result = evaluateLeadState({ engagement, followUpDue: true, asOf });
    expect(result.leadState).toBe('hot');
    expect(result.callToday).toBe(false);
    expect(result.callTodayReasons).toEqual([]);
  });

  it('follow_up_due can set Call Today without Hot', () => {
    const engagement = aggregateProspectOutreachEngagement({
      prospectId: 1,
      messages: [
        msg({
          id: '1',
          open_count: 1,
          click_count: 0,
          last_opened_at: '2026-08-09T00:00:00Z',
        }),
      ],
    });
    const result = evaluateLeadState({ engagement, followUpDue: true, asOf });
    expect(result.leadState).not.toBe('hot');
    expect(result.callToday).toBe(true);
    expect(result.callTodayReasons).toEqual(['follow_up_due']);
  });

  it('attributed reply within 3 days adds Call Today reason', () => {
    const engagement = aggregateProspectOutreachEngagement({
      prospectId: 1,
      messages: [msg({ id: '1', sent_at: '2026-08-01T00:00:00Z' })],
      reply: {
        attributed: true,
        confidence: 'confirmed_link_after_send',
        lastMessageAt: '2026-08-09T00:00:00Z',
      },
    });
    const result = evaluateLeadState({ engagement, asOf });
    expect(result.callTodayReasons).toContain('attributed_reply');
    expect(result.score).toBeGreaterThanOrEqual(OUTREACH_LEAD_RULES.pointsAttributedReply);
  });
});
