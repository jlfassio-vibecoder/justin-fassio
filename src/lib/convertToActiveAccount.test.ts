import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  convertToActiveAccount,
  demoteToProspect,
  isConversionOutcome,
} from '@/lib/convertToActiveAccount';

const insertOrderMock = vi.fn();
const upsertSettingsMock = vi.fn();
const resolveWriteMock = vi.fn();
const ensureMock = vi.fn();
const fetchMetaMock = vi.fn();
const fetchOperationalMock = vi.fn();
const updateStatusMock = vi.fn();
const recordAttributionMock = vi.fn();

vi.mock('@/lib/orders', () => ({
  insertOrder: (...args: unknown[]) => insertOrderMock(...args),
}));

vi.mock('@/lib/accountReorderSettings', () => ({
  upsertAccountReorderSettings: (...args: unknown[]) => upsertSettingsMock(...args),
}));

vi.mock('@/lib/outreachAttribution', () => ({
  recordConversionAttribution: (...args: unknown[]) => recordAttributionMock(...args),
}));

vi.mock('@/lib/lines', () => ({
  resolveWriteSalesLineId: (...args: unknown[]) => resolveWriteMock(...args),
}));

vi.mock('@/lib/retailerLineAccounts', () => ({
  ensureRetailerLineAccount: (...args: unknown[]) => ensureMock(...args),
  fetchLineWriteMeta: (...args: unknown[]) => fetchMetaMock(...args),
  fetchOperationalLineAccount: (...args: unknown[]) => fetchOperationalMock(...args),
  updateRetailerLineAccountStatus: (...args: unknown[]) => updateStatusMock(...args),
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
    resolveWriteMock.mockResolvedValue('line-ogr');
    ensureMock.mockResolvedValue({
      gate: 'allow',
      data: { id: 'rla-1', relationshipStatus: 'prospect' },
      error: null,
    });
    fetchMetaMock.mockResolvedValue({
      data: { code: 'ogr', status: 'active', defaultCurrency: 'CAD' },
      error: null,
    });
    updateStatusMock.mockResolvedValue({ error: null });
    insertOrderMock.mockResolvedValue({ data: { id: 'ord-1' }, error: null });
    upsertSettingsMock.mockResolvedValue({ data: { account_id: 1 }, error: null });
    recordAttributionMock.mockResolvedValue({ ok: true, id: 'attr-1' });
  });

  it('short-circuits when already an opened line account', async () => {
    ensureMock.mockResolvedValue({
      gate: 'allow',
      data: { id: 'rla-1', relationshipStatus: 'opened' },
      error: null,
    });
    const result = await convertToActiveAccount({
      accountId: 1,
      currentStatus: 'active_account',
    });

    expect(result).toEqual({ ok: true, alreadyActive: true });
    expect(updateStatusMock).not.toHaveBeenCalled();
    expect(insertOrderMock).not.toHaveBeenCalled();
  });

  it('updates RLA, inserts initial order, and upserts reorder settings', async () => {
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

    expect(result).toEqual(expect.objectContaining({ ok: true, alreadyActive: false }));
    expect(updateStatusMock).toHaveBeenCalledWith({
      lineAccountId: 'rla-1',
      relationshipStatus: 'opened',
      convertedAt: expect.any(String),
      initialOrderDate: '2026-08-02T12:00:00.000Z',
    });
    expect(insertOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: 42,
        line_id: 'line-ogr',
        retailer_line_account_id: 'rla-1',
        order_type: 'initial',
        season: 'fathers_day',
        order_date: '2026-08-02',
        total_amount_cad: 1500,
        status: 'submitted',
        notes: 'Opening write',
      }),
      expect.objectContaining({ writesEnabled: true, lineCode: 'ogr' }),
    );
    expect(upsertSettingsMock).toHaveBeenCalledWith({
      account_id: 42,
      last_order_date: '2026-08-02',
      retailer_line_account_id: 'rla-1',
    });
  });

  it('converts without an order when initialOrder is omitted', async () => {
    const result = await convertToActiveAccount({
      accountId: 7,
      currentStatus: 'prospect',
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, alreadyActive: false }));
    expect(updateStatusMock).toHaveBeenCalledWith({
      lineAccountId: 'rla-1',
      relationshipStatus: 'opened',
      convertedAt: expect.any(String),
      initialOrderDate: null,
    });
    expect(insertOrderMock).not.toHaveBeenCalled();
    expect(upsertSettingsMock).toHaveBeenCalledWith({
      account_id: 7,
      last_order_date: null,
      retailer_line_account_id: 'rla-1',
    });
  });

  it('returns an error when the RLA update fails', async () => {
    updateStatusMock.mockResolvedValue({ error: 'rls blocked' });

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

describe('demoteToProspect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveWriteMock.mockResolvedValue('line-ogr');
    fetchMetaMock.mockResolvedValue({
      data: { code: 'ogr', status: 'active', defaultCurrency: 'CAD' },
      error: null,
    });
    fetchOperationalMock.mockResolvedValue({
      data: { id: 'rla-1', relationshipStatus: 'opened' },
      error: null,
    });
    updateStatusMock.mockResolvedValue({ error: null });
  });

  it('short-circuits when not an opened line account', async () => {
    fetchOperationalMock.mockResolvedValue({
      data: { id: 'rla-1', relationshipStatus: 'prospect' },
      error: null,
    });
    const result = await demoteToProspect({
      accountId: 1,
      currentStatus: 'prospect',
    });

    expect(result).toEqual({ ok: true, alreadyProspect: true });
    expect(updateStatusMock).not.toHaveBeenCalled();
  });

  it('sets RLA status to prospect and clears converted_at', async () => {
    const result = await demoteToProspect({
      accountId: 42,
      currentStatus: 'active_account',
    });

    expect(result).toEqual({ ok: true, alreadyProspect: false });
    expect(updateStatusMock).toHaveBeenCalledWith({
      lineAccountId: 'rla-1',
      relationshipStatus: 'prospect',
      convertedAt: null,
    });
  });

  it('returns an error when the update fails', async () => {
    updateStatusMock.mockResolvedValue({ error: 'rls blocked' });

    const result = await demoteToProspect({
      accountId: 1,
      currentStatus: 'active_account',
    });

    expect(result).toEqual({ ok: false, error: 'rls blocked' });
  });
});
