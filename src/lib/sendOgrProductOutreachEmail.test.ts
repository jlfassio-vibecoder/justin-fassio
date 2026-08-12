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

  it('sends html and text once on success and returns resendEmailId', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_1' }, error: null });
    const { sendOgrProductOutreachEmail } = await import('@/lib/sendOgrProductOutreachEmail');
    const { CONTACT_EMAIL } = await import('@/data/landing');
    const result = await sendOgrProductOutreachEmail(
      {
        to: 'buyer@example.com',
        subject: 'Old Guys Rule — American Revival',
        html: '<p>Card</p>',
        text: 'Plain card',
        fromDisplayName: 'Alex Rivera',
      },
      { apiKey: 're_test_key' },
    );
    expect(result).toEqual({ ok: true, resendEmailId: 'msg_1' });
    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock).toHaveBeenCalledWith({
      from: `Alex Rivera <${CONTACT_EMAIL}>`,
      to: 'buyer@example.com',
      subject: 'Old Guys Rule — American Revival',
      html: '<p>Card</p>',
      text: 'Plain card',
    });
  });

  it('returns send_failed when Resend succeeds without an email id', async () => {
    sendMock.mockResolvedValue({ data: null, error: null });
    const { sendOgrProductOutreachEmail } = await import('@/lib/sendOgrProductOutreachEmail');
    const result = await sendOgrProductOutreachEmail(
      {
        to: 'buyer@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: 'Hi',
      },
      { apiKey: 're_test_key' },
    );
    expect(result).toEqual({
      ok: false,
      reason: 'send_failed',
      error: 'Missing Resend email id',
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
      { apiKey: 're_test_key' },
    );
    expect(result).toEqual({ ok: false, reason: 'send_failed', error: 'bounce' });
  });

  it('uses fromDisplayName with CONTACT_EMAIL', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_2' }, error: null });
    const { sendOgrProductOutreachEmail } = await import('@/lib/sendOgrProductOutreachEmail');
    const { CONTACT_EMAIL } = await import('@/data/landing');
    await sendOgrProductOutreachEmail(
      {
        to: 'buyer@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: 'Hi',
        fromDisplayName: 'Alex Rivera',
      },
      { apiKey: 're_test_key' },
    );
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: `Alex Rivera <${CONTACT_EMAIL}>`,
      }),
    );
  });

  it('uses the profile display name, not the email local-part, for the final Resend from', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_profile' }, error: null });
    const { sendOgrProductOutreachEmail } = await import('@/lib/sendOgrProductOutreachEmail');
    const { CONTACT_EMAIL } = await import('@/data/landing');
    await sendOgrProductOutreachEmail(
      {
        to: 'buyer@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: 'Hi',
        fromDisplayName: 'Justin Fassio',
      },
      { apiKey: 're_test_key' },
    );
    expect(CONTACT_EMAIL).toBe('office@justinfassio.com');
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Justin Fassio <office@justinfassio.com>',
      }),
    );
    const from = (sendMock.mock.calls[0]?.[0] as { from: string }).from;
    expect(from.startsWith('office ')).toBe(false);
    expect(from).not.toBe('office@justinfassio.com');
  });

  it('does not send office as the From display name when display_name is the local-part', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_office' }, error: null });
    const { sendOgrProductOutreachEmail } = await import('@/lib/sendOgrProductOutreachEmail');
    await sendOgrProductOutreachEmail(
      {
        to: 'buyer@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: 'Hi',
        fromDisplayName: 'office',
      },
      { apiKey: 're_test_key' },
    );
    const from = (sendMock.mock.calls[0]?.[0] as { from: string }).from;
    expect(from).toBe('Old Guys Rule <office@justinfassio.com>');
    expect(from.startsWith('office ')).toBe(false);
  });

  it('falls back From display name to Old Guys Rule when blank', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_3' }, error: null });
    const { sendOgrProductOutreachEmail } = await import('@/lib/sendOgrProductOutreachEmail');
    const { CONTACT_EMAIL } = await import('@/data/landing');
    await sendOgrProductOutreachEmail(
      {
        to: 'buyer@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: 'Hi',
        fromDisplayName: '   ',
      },
      { apiKey: 're_test_key' },
    );
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: `Old Guys Rule <${CONTACT_EMAIL}>`,
      }),
    );
  });
});
