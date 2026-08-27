import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import {
  fetchDueCallFollowUps,
  fetchProspectFollowUpContext,
  loadProspectsCalledToday,
} from '@/lib/calls';

type DbClient = SupabaseClient<Database>;

function thenable<T extends Record<string, unknown>>(
  methods: T,
  result: { data: unknown; error: unknown },
): T & PromiseLike<{ data: unknown; error: unknown }> {
  return {
    ...methods,
    then(onFulfilled, onRejected) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
}

function chain(result: { data: unknown; error: unknown }) {
  const api: Record<string, unknown> = {};
  const self = () => thenable(api, result);
  for (const key of ['select', 'eq', 'in', 'not', 'or', 'is', 'lte', 'gte', 'order', 'limit']) {
    api[key] = vi.fn(self);
  }
  return thenable(api, result);
}

describe('fetchProspectFollowUpContext', () => {
  it('uses only the latest call follow_up_date', async () => {
    const from = vi.fn(() =>
      chain({
        data: [
          {
            prospect_id: 1,
            follow_up_date: null,
            call_date: '2026-08-10',
            created_at: '2026-08-10T12:00:00Z',
          },
          {
            prospect_id: 1,
            follow_up_date: '2026-08-01',
            call_date: '2026-08-01',
            created_at: '2026-08-01T12:00:00Z',
          },
        ],
        error: null,
      }),
    );
    const client = { from } as unknown as DbClient;
    const ctx = await fetchProspectFollowUpContext(client, {
      asOf: new Date('2026-08-10T18:00:00Z'),
    });
    expect(ctx.has(1)).toBe(false);
  });

  it('marks overdue days when follow-up date is before today', async () => {
    const from = vi.fn(() =>
      chain({
        data: [
          {
            prospect_id: 2,
            follow_up_date: '2026-08-05',
            call_date: '2026-08-05',
            created_at: '2026-08-05T12:00:00Z',
          },
        ],
        error: null,
      }),
    );
    const client = { from } as unknown as DbClient;
    const ctx = await fetchProspectFollowUpContext(client, {
      asOf: new Date('2026-08-10T18:00:00Z'),
    });
    expect(ctx.get(2)).toEqual({ followUpDate: '2026-08-05', overdueDays: 5 });
  });
});

describe('fetchDueCallFollowUps', () => {
  it('returns prospect ids from follow-up context', async () => {
    const from = vi.fn(() =>
      chain({
        data: [
          {
            prospect_id: 3,
            follow_up_date: '2026-08-10',
            call_date: '2026-08-10',
            created_at: '2026-08-10T09:00:00Z',
          },
        ],
        error: null,
      }),
    );
    const client = { from } as unknown as DbClient;
    const due = await fetchDueCallFollowUps(client, {
      asOf: new Date('2026-08-10T18:00:00Z'),
    });
    expect(due.has(3)).toBe(true);
  });
});

describe('loadProspectsCalledToday', () => {
  it('returns max created_at per prospect for today', async () => {
    const from = vi.fn(() =>
      chain({
        data: [
          { prospect_id: 4, created_at: '2026-08-10T09:00:00Z' },
          { prospect_id: 4, created_at: '2026-08-10T15:00:00Z' },
        ],
        error: null,
      }),
    );
    const client = { from } as unknown as DbClient;
    const map = await loadProspectsCalledToday(client, {
      asOf: new Date('2026-08-10T18:00:00Z'),
    });
    expect(map.get(4)).toBe('2026-08-10T15:00:00Z');
  });
});
