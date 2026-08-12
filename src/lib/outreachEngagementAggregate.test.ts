import { describe, expect, it } from 'vitest';
import {
  aggregateProspectOutreachEngagement,
  type OutreachMessageRow,
} from '@/lib/outreachEngagementAggregate';

const PRODUCT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRODUCT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function msg(
  partial: Partial<OutreachMessageRow> & Pick<OutreachMessageRow, 'id'>,
): OutreachMessageRow {
  return {
    prospect_id: 10,
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

describe('outreachEngagementAggregate', () => {
  it('sums opens and clicks and tracks max click_count', () => {
    const engagement = aggregateProspectOutreachEngagement({
      prospectId: 10,
      messages: [
        msg({ id: 'a', open_count: 2, click_count: 3, last_clicked_at: '2026-08-02T00:00:00Z' }),
        msg({
          id: 'b',
          catalog_item_id: PRODUCT_B,
          open_count: 1,
          click_count: 0,
          last_opened_at: '2026-08-03T00:00:00Z',
        }),
      ],
      unlinkedManualIncluded: 1,
    });
    expect(engagement.openCount).toBe(3);
    expect(engagement.clickCount).toBe(3);
    expect(engagement.maxClickCountOnMessage).toBe(3);
    expect(engagement.distinctProductsOpened).toBe(2);
    expect(engagement.distinctProductsClicked).toBe(1);
    expect(engagement.unlinkedManualIncluded).toBe(1);
  });

  it('ignores unsent rows', () => {
    const engagement = aggregateProspectOutreachEngagement({
      prospectId: 10,
      messages: [msg({ id: 'a', sent_at: null, open_count: 9 })],
    });
    expect(engagement.emailsSent).toBe(0);
    expect(engagement.openCount).toBe(0);
  });
});
