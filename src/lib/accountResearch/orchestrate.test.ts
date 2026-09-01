import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSupabase } from '@/lib/agentAuth';
import type { AccountResearchRun } from '@/types/database';
import { ACCOUNT_RESEARCH_STALE_RUNNING_MS } from '@/lib/accountResearch/constants';

const loadSnapshotMock = vi.fn();

vi.mock('@/lib/accountResearch/snapshot', () => ({
  loadAccountResearchSnapshot: (...args: unknown[]) => loadSnapshotMock(...args),
}));

vi.mock('@/lib/accountResearch/identity', () => ({
  resolveAccountIdentity: () => ({
    identity_confidence: 'unresolved',
    identity_review_status: 'pending',
    identity_resolution: 'No usable official website hostname',
    resolved_website: null,
    official_hostname: null,
    corroborators: [],
  }),
}));

import {
  findLatestAccountResearch,
  startOrReuseAccountResearch,
} from '@/lib/accountResearch/orchestrate';

function makeRun(overrides: Partial<AccountResearchRun> = {}): AccountResearchRun {
  return {
    id: 'run-active',
    retailer_id: 7,
    status: 'running',
    trigger: 'manual',
    requested_scope: 'website',
    identity_confidence: 'unresolved',
    identity_review_status: 'pending',
    identity_resolution: null,
    identity_reviewed_by: null,
    identity_reviewed_at: null,
    resolved_website: null,
    provider_metadata: {},
    research_brief: null,
    provider: null,
    error: null,
    requested_by: 'user-1',
    supersedes_run_id: null,
    created_at: '2026-08-25T00:00:00.000Z',
    completed_at: null,
    started_at: new Date().toISOString(),
    ...overrides,
  } as AccountResearchRun;
}

function snapshotFor(run: AccountResearchRun) {
  return {
    run,
    sources: [
      {
        id: 'src-web',
        research_run_id: run.id,
        source_type: 'website',
        status: 'pending',
        search_mode: 'identity',
        query_text: null,
        resolved_public_url: null,
        error: null,
        provider: null,
        provider_metadata: {},
        result_count: 0,
        research_brief: null,
        requested_by: null,
        started_at: null,
        completed_at: null,
        created_at: run.created_at,
      },
    ],
    citationsBySourceId: {},
    sourceFreshness: {},
    locksBySourceType: {},
  };
}

describe('startOrReuseAccountResearch active conflict', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadSnapshotMock.mockReset();
  });

  it('returns resumed when an active run already exists', async () => {
    const active = makeRun();
    const snap = snapshotFor(active);
    loadSnapshotMock.mockResolvedValue(snap);

    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'ACTIVE_RUN_CONFLICT' } });

    const from = vi.fn((table: string) => {
      if (table === 'prospects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 7,
                  name: 'Test Shop',
                  city: null,
                  region: null,
                  phone: null,
                  website: null,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'account_research_runs') {
        return {
          select: () => ({
            eq: () => ({
              in: (_col: string, statuses: string[]) => {
                if (statuses.includes('running')) {
                  return {
                    order: () => ({
                      limit: async () => ({ data: [active], error: null }),
                    }),
                  };
                }
                return {
                  order: () => ({
                    limit: async () => ({ data: [], error: null }),
                  }),
                };
              },
              gte: () => ({
                // countManualRunsToday chain is select with count head
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
        };
      }
      if (table === 'account_research_source_searches') {
        return {
          update: () => ({
            eq: () => ({
              in: async () => ({ error: null }),
            }),
          }),
        };
      }
      return {};
    });

    // countManualRunsToday uses select with count
    const supabase = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === 'account_research_runs') {
          const chain: Record<string, unknown> = {};
          const selectFn = vi.fn((_cols?: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.count === 'exact') {
              return {
                eq: () => ({
                  eq: () => ({
                    gte: async () => ({ count: 0, error: null }),
                  }),
                }),
              };
            }
            return {
              eq: () => ({
                in: (_c: string, statuses: string[]) => {
                  if (statuses.includes('succeeded')) {
                    return {
                      order: () => ({
                        limit: async () => ({ data: [], error: null }),
                      }),
                    };
                  }
                  return {
                    order: () => ({
                      limit: async () => ({ data: [active], error: null }),
                    }),
                  };
                },
              }),
            };
          });
          chain.select = selectFn;
          chain.update = () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          });
          return chain;
        }
        return from(table);
      }),
    } as unknown as AgentSupabase;

    const result = await startOrReuseAccountResearch({
      supabase,
      userId: 'user-1',
      retailerId: 7,
      scope: 'website',
      forceRefresh: false,
      trigger: 'manual',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcome).toBe('resumed');
      expect(result.snapshot.run.id).toBe('run-active');
    }
  });

  it('finalizes a stale active run then starts a new one', async () => {
    const staleStarted = new Date(
      Date.now() - ACCOUNT_RESEARCH_STALE_RUNNING_MS - 5_000,
    ).toISOString();
    const stale = makeRun({ started_at: staleStarted });
    const staleSnap = snapshotFor(stale);
    const failedSources = [
      {
        ...staleSnap.sources[0],
        status: 'failed' as const,
        error: 'Timed out while running',
        completed_at: new Date().toISOString(),
      },
    ];
    const finalizedSnap = {
      ...staleSnap,
      sources: failedSources,
      run: {
        ...stale,
        status: 'failed' as const,
        completed_at: new Date().toISOString(),
      },
    };
    const freshRun = makeRun({
      id: 'run-new',
      started_at: new Date().toISOString(),
    });
    const freshSnap = snapshotFor(freshRun);

    loadSnapshotMock.mockImplementation(async (_supabase: unknown, runId: string) => {
      if (runId === 'run-new') return freshSnap;
      // Active lookup before finalize still shows pending source; after failNonTerminal,
      // finalize loads terminal sources so the run can close.
      if (loadSnapshotMock.mock.calls.length <= 1) return staleSnap;
      return finalizedSnap;
    });

    let rpcCalls = 0;
    const rpc = vi.fn(async () => {
      rpcCalls += 1;
      if (rpcCalls === 1) {
        return { data: null, error: { message: 'ACTIVE_RUN_CONFLICT' } };
      }
      return { data: { run_id: 'run-new' }, error: null };
    });

    let activeLookups = 0;
    const supabase = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === 'prospects') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 7,
                    name: 'Test Shop',
                    city: null,
                    region: null,
                    phone: null,
                    website: null,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'account_research_runs') {
          return {
            select: (_cols?: string, opts?: { count?: string }) => {
              if (opts?.count === 'exact') {
                return {
                  eq: () => ({
                    eq: () => ({
                      gte: async () => ({ count: 0, error: null }),
                    }),
                  }),
                };
              }
              return {
                eq: () => ({
                  in: (_c: string, statuses: string[]) => {
                    if (statuses.includes('running') || statuses.includes('pending')) {
                      activeLookups += 1;
                      const data = activeLookups === 1 ? [stale] : [];
                      return {
                        order: () => ({
                          limit: async () => ({ data, error: null }),
                        }),
                      };
                    }
                    return {
                      order: () => ({
                        limit: async () => ({ data: [], error: null }),
                      }),
                    };
                  },
                }),
              };
            },
            update: () => ({
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            }),
          };
        }
        if (table === 'account_research_source_searches') {
          return {
            update: () => ({
              eq: () => ({
                in: async () => ({ error: null }),
              }),
            }),
          };
        }
        return {};
      }),
    } as unknown as AgentSupabase;

    const result = await startOrReuseAccountResearch({
      supabase,
      userId: 'user-1',
      retailerId: 7,
      scope: 'website',
      forceRefresh: false,
      trigger: 'manual',
    });

    expect(rpcCalls).toBe(2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcome).toBe('started');
      expect(result.snapshot.run.id).toBe('run-new');
    }
  });
});

describe('findLatestAccountResearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadSnapshotMock.mockReset();
  });

  it('prefers an active running run over completed usable runs', async () => {
    const active = makeRun({ id: 'run-active-latest' });
    const snap = snapshotFor(active);
    loadSnapshotMock.mockResolvedValue(snap);

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'account_research_runs') {
          return {
            select: () => ({
              eq: () => ({
                in: (_c: string, statuses: string[]) => {
                  if (statuses.includes('running')) {
                    return {
                      order: () => ({
                        limit: async () => ({ data: [active], error: null }),
                      }),
                    };
                  }
                  return {
                    order: () => ({
                      limit: async () => ({ data: [], error: null }),
                    }),
                  };
                },
              }),
            }),
          };
        }
        return {};
      }),
    } as unknown as AgentSupabase;

    const latest = await findLatestAccountResearch(supabase, 7, 'all');
    expect(latest?.run.id).toBe('run-active-latest');
    expect(latest?.run.status).toBe('running');
  });
});
