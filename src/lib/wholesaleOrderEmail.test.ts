import { describe, expect, it, vi, beforeEach } from 'vitest';

const sendMock = vi.fn();

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => sendMock(...args) };
  },
}));

describe('sendWholesaleOrderConfirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('no-ops when API key is missing', async () => {
    const { sendWholesaleOrderConfirmation } = await import('@/lib/wholesaleOrderEmail');
    const result = await sendWholesaleOrderConfirmation(
      {
        requestNumber: 'W-2026-000001',
        buyerName: 'Sam',
        buyerEmail: 'sam@example.com',
        businessName: 'Shop',
        totalUnits: 24,
        merchandiseSubtotalUsd: 100,
        lines: [],
      },
      { apiKey: null },
    );
    expect(result).toEqual({ sent: false, reason: 'not_configured' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends when API key is present', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_1' }, error: null });
    const { sendWholesaleOrderConfirmation } = await import('@/lib/wholesaleOrderEmail');
    const result = await sendWholesaleOrderConfirmation(
      {
        requestNumber: 'W-2026-000001',
        buyerName: 'Sam',
        buyerEmail: 'sam@example.com',
        businessName: 'Shop',
        totalUnits: 6,
        merchandiseSubtotalUsd: 78,
        lines: [{ sku: 'OG1', name: 'Tee', size: 'L', quantity: 6, wholesaleUsd: 13 }],
      },
      { apiKey: 're_test_key', from: 'test@example.com' },
    );
    expect(result).toEqual({ sent: true });
    expect(sendMock).toHaveBeenCalledOnce();
  });

  it('sends inquiry subject and body without line items', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_2' }, error: null });
    const { sendWholesaleOrderConfirmation } = await import('@/lib/wholesaleOrderEmail');
    const result = await sendWholesaleOrderConfirmation(
      {
        requestNumber: 'W-2026-000003',
        buyerName: 'Sam',
        buyerEmail: 'sam@example.com',
        businessName: 'Shop',
        totalUnits: 0,
        merchandiseSubtotalUsd: 0,
        lines: [],
        requestType: 'inquiry',
        notes: 'Need opening assortment help.',
      },
      { apiKey: 're_test_key', from: 'test@example.com' },
    );
    expect(result).toEqual({ sent: true });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Wholesale inquiry W-2026-000003',
        html: expect.stringContaining('Need opening assortment help.'),
      }),
    );
    expect(sendMock.mock.calls[0]?.[0]?.html).not.toContain('<th>SKU</th>');
  });
});
