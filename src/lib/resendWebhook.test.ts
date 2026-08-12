import { describe, expect, it } from 'vitest';
import {
  computeSystemMessageWebhookPatch,
  isHandledResendEventType,
  normalizeResendWebhookEvent,
  type SystemMessageWebhookCurrent,
} from '@/lib/resendWebhook';

const base: SystemMessageWebhookCurrent = {
  status: 'sent',
  sent_at: '2026-08-11T12:00:00.000Z',
  delivered_at: null,
  opened_at: null,
  clicked_at: null,
  last_opened_at: null,
  last_clicked_at: null,
  last_engagement_received_at: null,
  bounced_at: null,
  failed_at: null,
  complained_at: null,
  open_count: 0,
  click_count: 0,
  last_event_at: null,
  failure_reason: null,
};

describe('isHandledResendEventType', () => {
  it('accepts allowlisted types', () => {
    expect(isHandledResendEventType('email.delivered')).toBe(true);
    expect(isHandledResendEventType('email.delivery_delayed')).toBe(false);
  });
});

describe('normalizeResendWebhookEvent', () => {
  it('extracts email id and bounce reason', () => {
    const normalized = normalizeResendWebhookEvent({
      type: 'email.bounced',
      created_at: '2026-08-11T13:00:00.000Z',
      data: {
        email_id: 're_abc',
        bounce: { message: 'mailbox full', type: 'soft' },
      },
    });
    expect(normalized).toEqual(
      expect.objectContaining({
        type: 'email.bounced',
        emailId: 're_abc',
        occurredAt: '2026-08-11T13:00:00.000Z',
        failureReason: 'mailbox full',
      }),
    );
  });

  it('returns null without email id', () => {
    expect(
      normalizeResendWebhookEvent({
        type: 'email.delivered',
        data: {},
      }),
    ).toBeNull();
  });
});

describe('computeSystemMessageWebhookPatch', () => {
  it('advances sent to delivered', () => {
    const patch = computeSystemMessageWebhookPatch(base, {
      type: 'email.delivered',
      occurredAt: '2026-08-11T12:01:00.000Z',
      failureReason: null,
    });
    expect(patch.status).toBe('delivered');
    expect(patch.delivered_at).toBe('2026-08-11T12:01:00.000Z');
  });

  it('increments opens without changing status', () => {
    const delivered: SystemMessageWebhookCurrent = {
      ...base,
      status: 'delivered',
      delivered_at: '2026-08-11T12:01:00.000Z',
    };
    const patch = computeSystemMessageWebhookPatch(
      delivered,
      {
        type: 'email.opened',
        occurredAt: '2026-08-11T12:05:00.000Z',
        failureReason: null,
      },
      { receivedAt: '2026-08-11T12:05:30.000Z' },
    );
    expect(patch.status).toBe('delivered');
    expect(patch.open_count).toBe(1);
    expect(patch.opened_at).toBe('2026-08-11T12:05:00.000Z');
    expect(patch.last_opened_at).toBe('2026-08-11T12:05:00.000Z');
    expect(patch.last_engagement_received_at).toBe('2026-08-11T12:05:30.000Z');
  });

  it('updates last_opened_at on subsequent opens without clearing first opened_at', () => {
    const alreadyOpened: SystemMessageWebhookCurrent = {
      ...base,
      status: 'delivered',
      delivered_at: '2026-08-11T12:01:00.000Z',
      open_count: 1,
      opened_at: '2026-08-11T12:05:00.000Z',
      last_opened_at: '2026-08-11T12:05:00.000Z',
      last_engagement_received_at: '2026-08-11T12:05:30.000Z',
    };
    const patch = computeSystemMessageWebhookPatch(
      alreadyOpened,
      {
        type: 'email.opened',
        occurredAt: '2026-08-11T13:00:00.000Z',
        failureReason: null,
      },
      { receivedAt: '2026-08-11T13:00:10.000Z' },
    );
    expect(patch.open_count).toBe(2);
    expect(patch.opened_at).toBeUndefined();
    expect(patch.last_opened_at).toBe('2026-08-11T13:00:00.000Z');
    expect(patch.last_engagement_received_at).toBe('2026-08-11T13:00:10.000Z');
  });

  it('does not regress last_opened_at when an older open arrives later', () => {
    const newerOpen: SystemMessageWebhookCurrent = {
      ...base,
      status: 'delivered',
      delivered_at: '2026-08-11T12:01:00.000Z',
      open_count: 1,
      opened_at: '2026-08-11T13:00:00.000Z',
      last_opened_at: '2026-08-11T13:00:00.000Z',
      last_engagement_received_at: '2026-08-11T13:00:10.000Z',
    };
    const patch = computeSystemMessageWebhookPatch(
      newerOpen,
      {
        type: 'email.opened',
        occurredAt: '2026-08-11T12:05:00.000Z',
        failureReason: null,
      },
      { receivedAt: '2026-08-11T13:05:00.000Z' },
    );
    expect(patch.open_count).toBe(2);
    expect(patch.last_opened_at).toBe('2026-08-11T13:00:00.000Z');
    expect(patch.last_engagement_received_at).toBe('2026-08-11T13:05:00.000Z');
  });

  it('increments clicks without changing status', () => {
    const delivered: SystemMessageWebhookCurrent = {
      ...base,
      status: 'delivered',
      delivered_at: '2026-08-11T12:01:00.000Z',
      open_count: 1,
      opened_at: '2026-08-11T12:05:00.000Z',
      last_opened_at: '2026-08-11T12:05:00.000Z',
    };
    const patch = computeSystemMessageWebhookPatch(
      delivered,
      {
        type: 'email.clicked',
        occurredAt: '2026-08-11T12:06:00.000Z',
        failureReason: null,
      },
      { receivedAt: '2026-08-11T12:06:05.000Z' },
    );
    expect(patch.status).toBe('delivered');
    expect(patch.click_count).toBe(1);
    expect(patch.opened_at).toBeUndefined();
    expect(patch.last_clicked_at).toBe('2026-08-11T12:06:00.000Z');
    expect(patch.last_engagement_received_at).toBe('2026-08-11T12:06:05.000Z');
  });

  it('does not regress last_clicked_at when an older click arrives later', () => {
    const newerClick: SystemMessageWebhookCurrent = {
      ...base,
      status: 'delivered',
      delivered_at: '2026-08-11T12:01:00.000Z',
      click_count: 1,
      clicked_at: '2026-08-11T13:00:00.000Z',
      last_clicked_at: '2026-08-11T13:00:00.000Z',
      last_engagement_received_at: '2026-08-11T13:00:10.000Z',
    };
    const patch = computeSystemMessageWebhookPatch(
      newerClick,
      {
        type: 'email.clicked',
        occurredAt: '2026-08-11T12:06:00.000Z',
        failureReason: null,
      },
      { receivedAt: '2026-08-11T13:05:00.000Z' },
    );
    expect(patch.click_count).toBe(2);
    expect(patch.last_clicked_at).toBe('2026-08-11T13:00:00.000Z');
    expect(patch.last_engagement_received_at).toBe('2026-08-11T13:05:00.000Z');
  });

  it('does not regress bounced to delivered', () => {
    const bounced: SystemMessageWebhookCurrent = {
      ...base,
      status: 'bounced',
      bounced_at: '2026-08-11T12:02:00.000Z',
      failure_reason: 'hard bounce',
    };
    const patch = computeSystemMessageWebhookPatch(bounced, {
      type: 'email.delivered',
      occurredAt: '2026-08-11T12:03:00.000Z',
      failureReason: null,
    });
    expect(patch.status).toBe('bounced');
  });

  it('bounce wins over delivered', () => {
    const delivered: SystemMessageWebhookCurrent = {
      ...base,
      status: 'delivered',
      delivered_at: '2026-08-11T12:01:00.000Z',
    };
    const patch = computeSystemMessageWebhookPatch(delivered, {
      type: 'email.bounced',
      occurredAt: '2026-08-11T12:04:00.000Z',
      failureReason: 'user unknown',
    });
    expect(patch.status).toBe('bounced');
    expect(patch.failure_reason).toBe('user unknown');
  });

  it('failed does not overwrite bounced', () => {
    const bounced: SystemMessageWebhookCurrent = {
      ...base,
      status: 'bounced',
      bounced_at: '2026-08-11T12:02:00.000Z',
      failure_reason: 'hard bounce',
    };
    const patch = computeSystemMessageWebhookPatch(bounced, {
      type: 'email.failed',
      occurredAt: '2026-08-11T12:05:00.000Z',
      failureReason: 'api error',
    });
    expect(patch.status).toBe('bounced');
    expect(patch.failed_at).toBe('2026-08-11T12:05:00.000Z');
  });
});
