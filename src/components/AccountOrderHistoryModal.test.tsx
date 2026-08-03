import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountOrderHistoryModal } from '@/components/AccountOrderHistoryModal';
import type { OrderRow } from '@/lib/orders';
import type { Prospect } from '@/lib/prospects';

const insertOrderMock = vi.fn();
const fetchSettingsMock = vi.fn();
const upsertSettingsMock = vi.fn();
const resolveOgrMock = vi.fn();

vi.mock('@/lib/orders', async () => {
  const actual = await vi.importActual<typeof import('@/lib/orders')>('@/lib/orders');
  return {
    ...actual,
    insertOrder: (...args: unknown[]) => insertOrderMock(...args),
  };
});

vi.mock('@/lib/accountReorderSettings', () => ({
  fetchAccountReorderSettings: (...args: unknown[]) => fetchSettingsMock(...args),
  upsertAccountReorderSettings: (...args: unknown[]) => upsertSettingsMock(...args),
}));

vi.mock('@/lib/lines', () => ({
  resolveOgrLineId: (...args: unknown[]) => resolveOgrMock(...args),
}));

const ACCOUNT: Prospect = {
  id: 42,
  name: 'Kelowna Golf & Country Club',
  category: 'Golf',
  region: 'Okanagan',
  city: 'Kelowna',
  address: '1297 Glenmore Dr',
  phone: '250-762-2531',
  fit: 'Test',
  accountStatus: 'active_account',
  convertedAt: '2026-08-01T00:00:00Z',
  initialOrderDate: '2026-08-01T00:00:00Z',
  notes: null,
};

const ORDERS: OrderRow[] = [
  {
    id: 'ord-1',
    account_id: 42,
    line_id: 'line-ogr',
    order_type: 'initial',
    season: 'fathers_day',
    order_date: '2026-04-01',
    total_amount_cad: 1200,
    status: 'submitted',
    notes: 'Opening write',
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
  },
  {
    id: 'ord-2',
    account_id: 42,
    line_id: 'line-ogr',
    order_type: 'reorder',
    season: 'holiday_christmas',
    order_date: '2026-08-01',
    total_amount_cad: 800,
    status: 'submitted',
    notes: 'Holiday prebook',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  },
];

describe('AccountOrderHistoryModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveOgrMock.mockResolvedValue('line-ogr');
    insertOrderMock.mockResolvedValue({ data: { id: 'ord-new' }, error: null });
    fetchSettingsMock.mockResolvedValue({
      data: {
        account_id: 42,
        last_order_date: '2026-08-01',
        next_suggested_contact_date: '2026-09-01',
        seasonal_cadence_tags: ['fathers_day'],
        ai_reorder_notes: 'keep me',
        updated_at: '2026-08-01T00:00:00Z',
      },
      error: null,
    });
    upsertSettingsMock.mockResolvedValue({ data: { account_id: 42 }, error: null });
  });

  it('filters the timeline by season', async () => {
    const user = userEvent.setup();
    render(
      <AccountOrderHistoryModal
        open
        account={ACCOUNT}
        orders={ORDERS}
        onClose={vi.fn()}
        onOrderSaved={vi.fn()}
      />,
    );

    expect(screen.getByText('Opening write')).toBeInTheDocument();
    expect(screen.getByText('Holiday prebook')).toBeInTheDocument();

    await user.selectOptions(screen.getByDisplayValue('All seasons'), 'fathers_day');

    expect(screen.getByText('Opening write')).toBeInTheDocument();
    expect(screen.queryByText('Holiday prebook')).not.toBeInTheDocument();
  });

  it('saves a reorder with defaults and merges reorder settings', async () => {
    const onClose = vi.fn();
    const onOrderSaved = vi.fn();

    const { container } = render(
      <AccountOrderHistoryModal
        open
        account={ACCOUNT}
        orders={ORDERS}
        onClose={onClose}
        onOrderSaved={onOrderSaved}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '500' } });
    const form = container.querySelector('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(insertOrderMock).toHaveBeenCalledWith(
        expect.objectContaining({
          account_id: 42,
          line_id: 'line-ogr',
          order_type: 'reorder',
          status: 'submitted',
          total_amount_cad: 500,
        }),
      );
    });

    expect(upsertSettingsMock).toHaveBeenCalledWith({
      account_id: 42,
      last_order_date: expect.any(String),
      next_suggested_contact_date: '2026-09-01',
      seasonal_cadence_tags: ['fathers_day'],
      ai_reorder_notes: 'keep me',
    });
    expect(onOrderSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows empty timeline copy when there are no orders', () => {
    render(
      <AccountOrderHistoryModal
        open
        account={ACCOUNT}
        orders={[]}
        onClose={vi.fn()}
        onOrderSaved={vi.fn()}
      />,
    );

    expect(screen.getByText(/No orders yet for this account/i)).toBeInTheDocument();
  });
});
