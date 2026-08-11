import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServiceRoleClientMock = vi.fn();
const verifyResendWebhookMock = vi.fn();
const applyResendSystemMessageEventMock = vi.fn();

vi.mock('@/lib/supabaseAdmin', () => ({
  getServiceRoleClient: (...args: unknown[]) => getServiceRoleClientMock(...args),
}));

vi.mock('@/lib/resendWebhook', async () => {
  const actual = await vi.importActual<typeof import('@/lib/resendWebhook')>(
    '@/lib/resendWebhook',
  );
  return {
    ...actual,
    verifyResendWebhook: (...args: unknown[]) => verifyResendWebhookMock(...args),
    applyResendSystemMessageEvent: (...args: unknown[]) =>
      applyResendSystemMessageEventMock(...args),
  };
});

import { POST } from '@/pages/api/webhooks/resend';

function requestWith(opts: {
  body: string;
  headers?: Record<string, string>;
}): Parameters<typeof POST>[0] {
  return {
    request: new Request('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': 'msg_1',
        'svix-timestamp': '1710000000',
        'svix-signature': 'v1,test',
        ...opts.headers,
      },
      body: opts.body,
    }),
  } as Parameters<typeof POST>[0];
}

const deliveredPayload = {
  type: 'email.delivered',
  created_at: '2026-08-11T12:01:00.000Z',
  data: { email_id: 're_123' },
};

describe('POST /api/webhooks/resend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('RESEND_WEBHOOK_SECRET', 'whsec_test_secret');
    getServiceRoleClientMock.mockReturnValue({ from: vi.fn() });
    verifyResendWebhookMock.mockReturnValue(deliveredPayload);
    applyResendSystemMessageEventMock.mockResolvedValue({
      ok: true,
      duplicate: false,
      systemMessageId: 'sm-1',
    });
  });

  it('returns 503 when webhook secret is missing', async () => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', '');
    const res = await POST(requestWith({ body: '{}' }));
    expect(res.status).toBe(503);
    expect(verifyResendWebhookMock).not.toHaveBeenCalled();
  });

  it('returns 503 when service role is missing', async () => {
    getServiceRoleClientMock.mockReturnValue(null);
    const res = await POST(requestWith({ body: '{}' }));
    expect(res.status).toBe(503);
    expect(verifyResendWebhookMock).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid signature', async () => {
    verifyResendWebhookMock.mockImplementation(() => {
      throw new Error('bad sig');
    });
    const res = await POST(requestWith({ body: '{"type":"email.delivered"}' }));
    expect(res.status).toBe(400);
    expect(applyResendSystemMessageEventMock).not.toHaveBeenCalled();
  });

  it('applies delivered event on success', async () => {
    const body = JSON.stringify(deliveredPayload);
    const res = await POST(requestWith({ body }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, systemMessageId: 'sm-1' });
    expect(verifyResendWebhookMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rawBody: body,
        secret: 'whsec_test_secret',
      }),
    );
    expect(applyResendSystemMessageEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        resendEventId: 'msg_1',
        event: expect.objectContaining({
          type: 'email.delivered',
          emailId: 're_123',
        }),
      }),
    );
  });

  it('returns 200 duplicate without re-applying side effects beyond apply call', async () => {
    applyResendSystemMessageEventMock.mockResolvedValue({ ok: true, duplicate: true });
    const res = await POST(requestWith({ body: JSON.stringify(deliveredPayload) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, duplicate: true });
  });

  it('returns 200 for unknown email id', async () => {
    applyResendSystemMessageEventMock.mockResolvedValue({
      ok: true,
      duplicate: false,
      unknownEmail: true,
    });
    const res = await POST(requestWith({ body: JSON.stringify(deliveredPayload) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, unknownEmail: true });
  });

  it('returns 200 ignored for unhandled event types', async () => {
    verifyResendWebhookMock.mockReturnValue({
      type: 'email.delivery_delayed',
      created_at: '2026-08-11T12:01:00.000Z',
      data: { email_id: 're_123' },
    });
    const res = await POST(
      requestWith({
        body: JSON.stringify({
          type: 'email.delivery_delayed',
          data: { email_id: 're_123' },
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      ignored: true,
      reason: 'unhandled_type',
    });
    expect(applyResendSystemMessageEventMock).not.toHaveBeenCalled();
  });

  it('returns 500 when apply fails', async () => {
    applyResendSystemMessageEventMock.mockResolvedValue({
      ok: false,
      error: 'db down',
    });
    const res = await POST(requestWith({ body: JSON.stringify(deliveredPayload) }));
    expect(res.status).toBe(500);
  });
});
