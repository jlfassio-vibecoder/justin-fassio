import { describe, expect, it } from 'vitest';
import type { OutreachMessageRow } from '@/lib/outreachEngagementAggregate';
import { leadStateAtSendTime } from '@/lib/outreachLeadStateAtSend';

const PRODUCT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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

describe('leadStateAtSendTime', () => {
  it('returns cold before meaningful engagement', () => {
    const state = leadStateAtSendTime({
      prospectId: 1,
      sentAt: '2026-08-02T12:00:00Z',
      messages: [msg({ id: '1', sent_at: '2026-08-01T12:00:00Z' })],
    });
    expect(state).toBe('cold');
  });

  it('returns warm when score and recency qualify at send time', () => {
    const state = leadStateAtSendTime({
      prospectId: 1,
      sentAt: '2026-08-05T12:00:00Z',
      messages: [
        msg({
          id: '1',
          sent_at: '2026-08-01T12:00:00Z',
          open_count: 2,
          click_count: 1,
          last_opened_at: '2026-08-04T10:00:00Z',
          last_clicked_at: '2026-08-04T11:00:00Z',
        }),
      ],
    });
    expect(['warm', 'hot']).toContain(state);
  });
});
