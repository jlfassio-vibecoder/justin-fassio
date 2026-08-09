import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => sendMock(...args) };
  },
}));

describe('sendOgrProductOutreachEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns not_configured when API key is missing', async () => {
    const { sendOgrProductOutreachEmail } = await import('@/lib/sendOgrProductOutreachEmail');
    const result = await sendOgrProductOutreachEmail(
      {
        to: 'buyer@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: 'Hi',
      },
      { apiKey: null },
    );
    expect(result).toEqual({ ok: false, reason: 'not_configured' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns not_configured for placeholder API key', async () => {
    const { sendOgrProductOutreachEmail } = await import('@/lib/sendOgrProductOutreachEmail');
    const result = await sendOgrProductOutreachEmail(
      {
        to: 'buyer@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: 'Hi',
      },
      { apiKey: 're_xxxxxxxxx' },
    );
    expect(result).toEqual({ ok: false, reason: 'not_configured' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends html and text once on success', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_1' }, error: null });
    const { sendOgrProductOutreachEmail } = await import('@/lib/sendOgrProductOutreachEmail');
    const result = await sendOgrProductOutreachEmail(
      {
        to: 'buyer@example.com',
        subject: 'Old Guys Rule — American Revival',
        html: '<p>Card</p>',
        text: 'Plain card',
      },
      { apiKey: 're_test_key', from: 'test@example.com' },
    );
    expect(result).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock).toHaveBeenCalledWith({
      from: 'test@example.com',
      to: 'buyer@example.com',
      subject: 'Old Guys Rule — American Revival',
      html: '<p>Card</p>',
      text: 'Plain card',
    });
  });

  it('returns send_failed when Resend rejects', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'bounce' } });
    const { sendOgrProductOutreachEmail } = await import('@/lib/sendOgrProductOutreachEmail');
    const result = await sendOgrProductOutreachEmail(
      {
        to: 'buyer@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: 'Hi',
      },
      { apiKey: 're_test_key', from: 'test@example.com' },
    );
    expect(result).toEqual({ ok: false, reason: 'send_failed', error: 'bounce' });
  });

  it('uses CONTACT_EMAIL From when from env unset', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_2' }, error: null });
    const { sendOgrProductOutreachEmail } = await import('@/lib/sendOgrProductOutreachEmail');
    const { CONTACT_EMAIL } = await import('@/data/landing');
    await sendOgrProductOutreachEmail(
      {
        to: 'buyer@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: 'Hi',
      },
      { apiKey: 're_test_key', from: null },
    );
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: `Justin Fassio <${CONTACT_EMAIL}>`,
      }),
    );
  });
});
