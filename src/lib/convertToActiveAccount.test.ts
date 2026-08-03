import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convertToActiveAccount, isConversionOutcome } from '@/lib/convertToActiveAccount';

const updateMock = vi.fn();
const eqMock = vi.fn();
const insertOrderMock = vi.fn();
const upsertSettingsMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'prospects') {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        update: (row: unknown) => {
          updateMock(row);
          return { eq: eqMock };
        },
      };
    },
  },
}));

vi.mock('@/lib/orders', () => ({
  insertOrder: (...args: unknown[]) => insertOrderMock(...args),
}));

vi.mock('@/lib/accountReorderSettings', () => ({
  upsertAccountReorderSettings: (...args: unknown[]) => upsertSettingsMock(...args),
}));

describe('isConversionOutcome', () => {
  it('matches Closed PO and Account Converted only', () => {
    expect(isConversionOutcome('Closed PO / Written Order')).toBe(true);
    expect(isConversionOutcome('Account Converted')).toBe(true);
    expect(isConversionOutcome('Follow-up Scheduled')).toBe(false);
  });
});

describe('convertToActiveAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eqMock.mockResolvedValue({ error: null });
    insertOrderMock.mockResolvedValue({ data: { id: 'ord-1' }, error: null });
    upsertSettingsMock.mockResolvedValue({ data: { account_id: 1 }, error: null });
  });

  it('short-circuits when already an active account', async () => {
    const result = await convertToActiveAccount({
      accountId: 1,
      currentStatus: 'active_account',
    });

    expect(result).toEqual({ ok: true, alreadyActive: true });
    expect(updateMock).not.toHaveBeenCalled();
    expect(insertOrderMock).not.toHaveBeenCalled();
  });

  it('updates prospect, inserts initial order, and upserts reorder settings', async () => {
    const result = await convertToActiveAccount({
      accountId: 42,
      currentStatus: 'prospect',
      initialOrder: {
        season: 'fathers_day',
        totalAmountCad: 1500,
        notes: 'Opening write',
        orderDate: '2026-08-02',
        lineId: 'line-ogr',
      },
    });

    expect(result).toEqual({ ok: true, alreadyActive: false });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        account_status: 'active_account',
        initial_order_date: '2026-08-02T12:00:00.000Z',
      }),
    );
    expect(eqMock).toHaveBeenCalledWith('id', 42);
    expect(insertOrderMock).toHaveBeenCalledWith({
      account_id: 42,
      line_id: 'line-ogr',
      order_type: 'initial',
      season: 'fathers_day',
      order_date: '2026-08-02',
      total_amount_cad: 1500,
      status: 'submitted',
      notes: 'Opening write',
    });
    expect(upsertSettingsMock).toHaveBeenCalledWith({
      account_id: 42,
      last_order_date: '2026-08-02',
    });
  });

  it('converts without an order when initialOrder is omitted', async () => {
    const result = await convertToActiveAccount({
      accountId: 7,
      currentStatus: 'prospect',
    });

    expect(result).toEqual({ ok: true, alreadyActive: false });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        account_status: 'active_account',
        initial_order_date: null,
      }),
    );
    expect(insertOrderMock).not.toHaveBeenCalled();
    expect(upsertSettingsMock).toHaveBeenCalledWith({
      account_id: 7,
      last_order_date: null,
    });
  });

  it('returns an error when the prospect update fails', async () => {
    eqMock.mockResolvedValue({ error: { message: 'rls blocked' } });

    const result = await convertToActiveAccount({
      accountId: 1,
      currentStatus: 'prospect',
    });

    expect(result).toEqual({ ok: false, error: 'rls blocked' });
    expect(insertOrderMock).not.toHaveBeenCalled();
  });

  it('returns an error when order insert fails after status update', async () => {
    insertOrderMock.mockResolvedValue({ data: null, error: 'orders insert failed' });

    const result = await convertToActiveAccount({
      accountId: 1,
      currentStatus: 'prospect',
      initialOrder: {
        season: 'spring_summer',
        totalAmountCad: 100,
      },
    });

    expect(result).toEqual({ ok: false, error: 'orders insert failed' });
    expect(upsertSettingsMock).not.toHaveBeenCalled();
  });
});
