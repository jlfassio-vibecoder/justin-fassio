import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServiceRoleClientMock = vi.fn();
const matchOrCreateWholesaleProspectMock = vi.fn();
const sendWholesaleOrderConfirmationMock = vi.fn();
const checkWholesaleOrderRateLimitMock = vi.fn();
const resetWholesaleOrderRateLimitForTestsMock = vi.fn();
const upsertWholesaleInboundMessageMock = vi.fn();

vi.mock('@/lib/supabaseAdmin', () => ({
  getServiceRoleClient: (...args: unknown[]) => getServiceRoleClientMock(...args),
}));

vi.mock('@/lib/wholesaleProspectMatch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/wholesaleProspectMatch')>();
  return {
    ...actual,
    matchOrCreateWholesaleProspect: (...args: unknown[]) =>
      matchOrCreateWholesaleProspectMock(...args),
  };
});

vi.mock('@/lib/wholesaleOrderEmail', () => ({
  sendWholesaleOrderConfirmation: (...args: unknown[]) =>
    sendWholesaleOrderConfirmationMock(...args),
}));

vi.mock('@/lib/wholesaleOrderRateLimit', () => ({
  checkWholesaleOrderRateLimit: (...args: unknown[]) => checkWholesaleOrderRateLimitMock(...args),
  resetWholesaleOrderRateLimitForTests: (...args: unknown[]) =>
    resetWholesaleOrderRateLimitForTestsMock(...args),
}));

vi.mock('@/lib/messageCenterInbound', () => ({
  upsertWholesaleInboundMessage: (...args: unknown[]) => upsertWholesaleInboundMessageMock(...args),
}));

import { POST } from '@/pages/api/wholesale/order-requests';

const validBody = {
  idempotencyKey: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  businessName: 'Kelowna Outfitters',
  buyerName: 'Sam Buyer',
  email: 'sam@example.com',
  phone: '250-555-0100',
  city: 'Kelowna',
  province: 'BC',
  postalCode: 'V1Y 1A1',
  retailChannel: 'Outdoor / sporting goods',
  isExistingCustomer: false,
  companyFax: '',
  lines: [
    {
      productId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      sku: 'OG2513',
      name: 'American Revival',
      size: 'L',
      wholesaleUsd: 13,
      quantity: 6,
    },
  ],
};

function requestWith(body: unknown) {
  return {
    request: new Request('http://localhost/api/wholesale/order-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  } as Parameters<typeof POST>[0];
}

type TableHandlers = {
  maybeSingle?: () => Promise<{ data: unknown; error: unknown }>;
  single?: () => Promise<{ data: unknown; error: unknown }>;
  insertResult?: { data?: unknown; error?: unknown };
  updateResult?: { error?: unknown };
};

function createAdminMock(handlers: {
  wholesale_order_requests?: TableHandlers;
  wholesale_order_request_items?: TableHandlers;
  prospect_updates?: TableHandlers;
}) {
  const insertCalls: Array<{ table: string; payload: unknown }> = [];
  const updateCalls: Array<{ table: string; payload: unknown }> = [];

  const from = vi.fn((table: string) => {
    const h =
      table === 'wholesale_order_requests'
        ? handlers.wholesale_order_requests
        : table === 'wholesale_order_request_items'
          ? handlers.wholesale_order_request_items
          : table === 'prospect_updates'
            ? handlers.prospect_updates
            : undefined;

    const api: Record<string, unknown> = {};
    const self = () => api;
    api.select = vi.fn(self);
    api.eq = vi.fn(self);
    api.delete = vi.fn(self);
    api.maybeSingle = vi.fn(async () => h?.maybeSingle?.() ?? { data: null, error: null });
    api.single = vi.fn(async () => h?.single?.() ?? { data: null, error: null });
    api.insert = vi.fn((payload: unknown) => {
      insertCalls.push({ table, payload });
      const result = h?.insertResult ?? { data: null, error: null };
      return {
        select: () => ({
          single: async () =>
            result.data !== undefined
              ? { data: result.data, error: result.error ?? null }
              : { data: null, error: result.error ?? null },
        }),
        then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          Promise.resolve({ data: null, error: result.error ?? null }).then(
            onFulfilled,
            onRejected,
          ),
      };
    });
    api.update = vi.fn((payload: unknown) => {
      updateCalls.push({ table, payload });
      const result = h?.updateResult ?? { error: null };
      return {
        eq: () => ({
          then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
            Promise.resolve({ error: result.error ?? null }).then(onFulfilled, onRejected),
        }),
      };
    });
    return api;
  });

  return { from, insertCalls, updateCalls };
}

describe('POST /api/wholesale/order-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkWholesaleOrderRateLimitMock.mockReturnValue({ ok: true });
    sendWholesaleOrderConfirmationMock.mockResolvedValue({ sent: false, reason: 'not_configured' });
    upsertWholesaleInboundMessageMock.mockResolvedValue({
      ok: true,
      threadId: 'thread-1',
      messageId: 'msg-1',
      createdThread: true,
    });
  });

  it('honeypot returns fake success without touching the DB', async () => {
    const res = await POST(requestWith({ ...validBody, companyFax: 'bot-filled' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, requestNumber: 'W-2026-000000' });
    expect(getServiceRoleClientMock).not.toHaveBeenCalled();
    expect(matchOrCreateWholesaleProspectMock).not.toHaveBeenCalled();
    expect(sendWholesaleOrderConfirmationMock).not.toHaveBeenCalled();
  });

  it('idempotent replay skips CRM and email', async () => {
    const admin = createAdminMock({
      wholesale_order_requests: {
        maybeSingle: async () => ({
          data: { request_number: 'W-2026-000042' },
          error: null,
        }),
      },
    });
    getServiceRoleClientMock.mockReturnValue(admin);

    const res = await POST(requestWith(validBody));
    const json = await res.json();
    expect(json).toEqual({ ok: true, requestNumber: 'W-2026-000042' });
    expect(matchOrCreateWholesaleProspectMock).not.toHaveBeenCalled();
    expect(sendWholesaleOrderConfirmationMock).not.toHaveBeenCalled();
    expect(admin.insertCalls).toHaveLength(0);
  });

  it('happy path inserts lines, links prospect, writes activity, and emails', async () => {
    const admin = createAdminMock({
      wholesale_order_requests: {
        maybeSingle: async () => ({ data: null, error: null }),
        insertResult: {
          data: { id: 'req-1', request_number: 'W-2026-000100' },
          error: null,
        },
        updateResult: { error: null },
      },
      wholesale_order_request_items: {
        insertResult: { error: null },
      },
      prospect_updates: {
        insertResult: { error: null },
      },
    });
    getServiceRoleClientMock.mockReturnValue(admin);
    matchOrCreateWholesaleProspectMock.mockResolvedValue({
      ok: true,
      prospectId: 55,
      matched: 'created',
    });

    const res = await POST(requestWith(validBody));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, requestNumber: 'W-2026-000100' });

    expect(admin.insertCalls.some((c) => c.table === 'wholesale_order_requests')).toBe(true);
    expect(admin.insertCalls.some((c) => c.table === 'wholesale_order_request_items')).toBe(true);
    expect(matchOrCreateWholesaleProspectMock).toHaveBeenCalledOnce();
    expect(admin.updateCalls).toContainEqual({
      table: 'wholesale_order_requests',
      payload: { prospect_id: 55 },
    });
    expect(admin.insertCalls.some((c) => c.table === 'prospect_updates')).toBe(true);
    expect(sendWholesaleOrderConfirmationMock).toHaveBeenCalledOnce();
    expect(upsertWholesaleInboundMessageMock).toHaveBeenCalledOnce();
    expect(upsertWholesaleInboundMessageMock).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        orderRequestId: 'req-1',
        requestNumber: 'W-2026-000100',
        businessName: 'Kelowna Outfitters',
        email: 'sam@example.com',
      }),
    );
  });
});
