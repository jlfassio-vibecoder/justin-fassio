import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductOutreachHistoryItem } from '@/lib/systemMessages';

const fetchProductOutreachHistoryMock = vi.fn();

vi.mock('@/lib/systemMessages', async () => {
  const actual = await vi.importActual<typeof import('@/lib/systemMessages')>(
    '@/lib/systemMessages',
  );
  return {
    ...actual,
    fetchProductOutreachHistory: (...args: unknown[]) =>
      fetchProductOutreachHistoryMock(...args),
  };
});

import { ProductEmailHistory } from '@/components/product/ProductEmailHistory';

const PRODUCT_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

const SAMPLE: ProductOutreachHistoryItem = {
  id: 'sm-1',
  toEmail: 'buyer@example.com',
  toName: 'Sam',
  subject: 'Old Guys Rule — American Revival',
  status: 'delivered',
  sentAt: '2026-08-11T15:00:00.000Z',
  prospectId: 42,
  accountContactId: 'c1',
  prospectName: 'Kelowna Golf',
  contactName: 'Sam Buyer',
  createdAt: '2026-08-11T15:00:00.000Z',
  openCount: 2,
  clickCount: 1,
  openedAt: '2026-08-11T15:10:00.000Z',
  clickedAt: '2026-08-11T15:11:00.000Z',
  deliveredAt: '2026-08-11T15:01:00.000Z',
  bouncedAt: null,
  failedAt: null,
  failureReason: null,
};

describe('ProductEmailHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty state', async () => {
    fetchProductOutreachHistoryMock.mockResolvedValue({ data: [], error: null });
    render(<ProductEmailHistory catalogItemId={PRODUCT_ID} />);
    expect(screen.getByText('Loading email history…')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('No product emails sent yet.')).toBeInTheDocument();
    });
    expect(fetchProductOutreachHistoryMock).toHaveBeenCalledWith(PRODUCT_ID);
  });

  it('renders recipient, status, CRM, engagement, and time', async () => {
    fetchProductOutreachHistoryMock.mockResolvedValue({ data: [SAMPLE], error: null });
    render(<ProductEmailHistory catalogItemId={PRODUCT_ID} />);
    await waitFor(() => {
      expect(screen.getByText('Sam · buyer@example.com')).toBeInTheDocument();
    });
    expect(screen.getByText(/Delivered/)).toBeInTheDocument();
    expect(screen.getByText(/Kelowna Golf · Sam Buyer/)).toBeInTheDocument();
    expect(screen.getByText('Opens 2 · Clicks 1')).toBeInTheDocument();
    expect(screen.getByText('Old Guys Rule — American Revival')).toBeInTheDocument();
  });

  it('shows error state', async () => {
    fetchProductOutreachHistoryMock.mockResolvedValue({
      data: [],
      error: 'permission denied',
    });
    render(<ProductEmailHistory catalogItemId={PRODUCT_ID} />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('permission denied');
    });
  });

  it('refetches when reloadToken changes', async () => {
    fetchProductOutreachHistoryMock.mockResolvedValue({ data: [], error: null });
    const { rerender } = render(
      <ProductEmailHistory catalogItemId={PRODUCT_ID} reloadToken={0} />,
    );
    await waitFor(() => {
      expect(fetchProductOutreachHistoryMock).toHaveBeenCalledTimes(1);
    });

    fetchProductOutreachHistoryMock.mockResolvedValue({ data: [SAMPLE], error: null });
    rerender(<ProductEmailHistory catalogItemId={PRODUCT_ID} reloadToken={1} />);
    await waitFor(() => {
      expect(fetchProductOutreachHistoryMock).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Sam · buyer@example.com')).toBeInTheDocument();
    });
  });
});
