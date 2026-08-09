import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSessionMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
    },
  },
}));

import { sendOgrProductEmail } from '@/lib/sendOgrProductEmailClient';

describe('sendOgrProductEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('returns not signed in when there is no session', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const result = await sendOgrProductEmail({
      productId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      to: 'buyer@example.com',
    });
    expect(result).toEqual({ ok: false, error: 'Not signed in' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('POSTs only supported fields on success', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await sendOgrProductEmail({
      productId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      to: 'buyer@example.com',
      recipientName: 'Sam',
      subject: 'Custom subject',
      introText: 'Custom intro',
      closingText: 'Custom close',
    });

    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/staff/ogr-product-email');
    expect(init?.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer tok',
        'Content-Type': 'application/json',
      }),
    );
    const body = JSON.parse(String(init?.body)) as Record<string, string>;
    expect(body).toEqual({
      productId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      to: 'buyer@example.com',
      recipientName: 'Sam',
      subject: 'Custom subject',
      introText: 'Custom intro',
      closingText: 'Custom close',
    });
    expect(body).not.toHaveProperty('html');
    expect(body).not.toHaveProperty('from');
    expect(body).not.toHaveProperty('signatureName');
    expect(body).not.toHaveProperty('productHref');
  });

  it('surfaces API error message', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'Email is not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await sendOgrProductEmail({
      productId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      to: 'buyer@example.com',
    });
    expect(result).toEqual({ ok: false, error: 'Email is not configured' });
  });
});
