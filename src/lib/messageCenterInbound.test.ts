import { beforeEach, describe, expect, it, vi } from 'vitest';
import { identityFingerprint } from '@/lib/messageFingerprint';
import { upsertWholesaleInboundMessage } from '@/lib/messageCenterInbound';

type ThreadRow = {
  id: string;
  prospect_id: number | null;
  mapping_status: string;
  identity_fingerprint: string;
  confirmed_fingerprint: string | null;
  source?: string;
};

function createAdminMock(opts: {
  threadByFingerprint?: ThreadRow | null;
  threadByEmail?: ThreadRow | null;
  createThreadId?: string;
  messageId?: string;
  updateError?: string | null;
  insertMessageError?: string | null;
}) {
  const updates: Array<{ table: string; payload: unknown }> = [];
  const inserts: Array<{ table: string; payload: unknown }> = [];

  const from = vi.fn((table: string) => {
    const api: Record<string, unknown> = {};
    const self = () => api;

    api.select = vi.fn(self);
    api.eq = vi.fn((col: string, val: unknown) => {
      api.__eq = { col, val };
      return api;
    });
    api.filter = vi.fn(self);
    api.order = vi.fn(self);
    api.limit = vi.fn(self);
    api.maybeSingle = vi.fn(async () => {
      if (table === 'message_threads') {
        return { data: opts.threadByFingerprint ?? null, error: null };
      }
      return { data: null, error: null };
    });
    api.single = vi.fn(async () => {
      if (table === 'message_threads') {
        return { data: { id: opts.createThreadId ?? 'thread-new' }, error: null };
      }
      if (table === 'messages') {
        if (opts.insertMessageError) {
          return { data: null, error: { message: opts.insertMessageError } };
        }
        return { data: { id: opts.messageId ?? 'msg-1' }, error: null };
      }
      return { data: null, error: null };
    });
    api.insert = vi.fn((payload: unknown) => {
      inserts.push({ table, payload });
      return {
        select: () => ({
          single: api.single,
        }),
      };
    });
    api.update = vi.fn((payload: unknown) => {
      updates.push({ table, payload });
      return {
        eq: () =>
          Promise.resolve({
            error: opts.updateError ? { message: opts.updateError } : null,
          }),
      };
    });

    // messages email lookup returns array via thenable chain ending without maybeSingle
    if (table === 'messages') {
      api.then = undefined;
      const originalLimit = api.limit as (...a: unknown[]) => unknown;
      api.limit = vi.fn(() => {
        // When selecting messages for email reunite (no insert), resolve as list.
        const listPromise = Promise.resolve({
          data: opts.threadByEmail
            ? [
                {
                  thread_id: opts.threadByEmail.id,
                  created_at: '2026-08-01T00:00:00Z',
                  message_threads: { ...opts.threadByEmail, source: 'old-guys-rule-wholesale' },
                },
              ]
            : [],
          error: null,
        });
        return Object.assign(listPromise, {
          // allow further chaining if any
        });
      });
      void originalLimit;
    }

    return api;
  });

  return { from, updates, inserts } as unknown as {
    from: typeof from;
    updates: typeof updates;
    inserts: typeof inserts;
  };
}

const baseInput = {
  orderRequestId: 'req-1',
  requestNumber: 'W-2026-000100',
  businessName: 'Kelowna Outfitters',
  buyerName: 'Sam Buyer',
  email: 'sam@example.com',
  phone: '250-555-0100',
  city: 'Kelowna',
  province: 'BC',
  postalCode: 'V1Y 1A1',
  retailChannel: 'Outdoor',
  isExistingCustomer: false,
  totalUnits: 6,
  merchandiseSubtotalUsd: 78,
  lines: [
    {
      sku: 'OG2513',
      name: 'American Revival',
      size: 'L',
      wholesaleUsd: 13,
      quantity: 6,
    },
  ],
};

describe('upsertWholesaleInboundMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an unmapped thread when none exists', async () => {
    const admin = createAdminMock({ createThreadId: 'thread-1', messageId: 'msg-1' });
    const result = await upsertWholesaleInboundMessage(admin as never, baseInput);
    expect(result).toEqual({
      ok: true,
      threadId: 'thread-1',
      messageId: 'msg-1',
      createdThread: true,
    });
    expect(admin.inserts.some((i) => i.table === 'message_threads')).toBe(true);
    expect(admin.inserts.some((i) => i.table === 'messages')).toBe(true);
    const threadInsert = admin.inserts.find((i) => i.table === 'message_threads');
    expect(threadInsert?.payload).toMatchObject({
      mapping_status: 'unmapped',
      identity_fingerprint: identityFingerprint({
        email: baseInput.email,
        businessName: baseInput.businessName,
        buyerName: baseInput.buyerName,
      }),
    });
  });

  it('appends to an existing confirmed thread with matching fingerprint', async () => {
    const fp = identityFingerprint({
      email: baseInput.email,
      businessName: baseInput.businessName,
      buyerName: baseInput.buyerName,
    });
    const admin = createAdminMock({
      threadByFingerprint: {
        id: 'thread-existing',
        prospect_id: 55,
        mapping_status: 'confirmed',
        identity_fingerprint: fp,
        confirmed_fingerprint: fp,
      },
      messageId: 'msg-2',
    });

    const result = await upsertWholesaleInboundMessage(admin as never, baseInput);
    expect(result).toEqual({
      ok: true,
      threadId: 'thread-existing',
      messageId: 'msg-2',
      createdThread: false,
    });
    expect(admin.updates.some((u) => u.table === 'message_threads')).toBe(true);
    const update = admin.updates.find((u) => u.table === 'message_threads');
    expect(update?.payload).not.toMatchObject({ mapping_status: 'suggested' });
  });

  it('marks suggested when inbound identity differs from confirmed fingerprint', async () => {
    const oldFp = 'sam@example.com|old name|sam buyer';
    const admin = createAdminMock({
      threadByFingerprint: null,
      threadByEmail: {
        id: 'thread-drift',
        prospect_id: 55,
        mapping_status: 'confirmed',
        identity_fingerprint: oldFp,
        confirmed_fingerprint: oldFp,
      },
      messageId: 'msg-3',
    });

    const result = await upsertWholesaleInboundMessage(admin as never, baseInput);
    expect(result.ok).toBe(true);
    const update = admin.updates.find((u) => u.table === 'message_threads');
    expect(update?.payload).toMatchObject({
      mapping_status: 'suggested',
      confirmed_fingerprint: null,
    });
  });
});
