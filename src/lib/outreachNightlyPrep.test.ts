import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadOutreachGoalDashboardSnapshotMock = vi.fn();
const selectOutreachTargetsMock = vi.fn();
const generateOgrProductOutreachDraftsMock = vi.fn();
const allocateChannelsForDayMock = vi.fn();
const refreshPersistedLeadRulesMock = vi.fn();

vi.mock('@/lib/refreshPersistedLeadRules', () => ({
  refreshPersistedLeadRules: (...args: unknown[]) => refreshPersistedLeadRulesMock(...args),
}));

vi.mock('@/lib/outreachGoalDashboard', () => ({
  loadOutreachGoalDashboardSnapshot: (...args: unknown[]) =>
    loadOutreachGoalDashboardSnapshotMock(...args),
}));

vi.mock('@/lib/outreachSelectTargets', () => ({
  formatOutreachPreparationDate: () => '2026-08-12',
  selectOutreachTargets: (...args: unknown[]) => selectOutreachTargetsMock(...args),
}));

vi.mock('@/lib/generateOgrProductOutreachDraft', () => ({
  generateOgrProductOutreachDrafts: (...args: unknown[]) =>
    generateOgrProductOutreachDraftsMock(...args),
}));

vi.mock('@/lib/systemMessages', () => ({
  SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL: 'agent_product_email',
  SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH: 'product_outreach',
}));

vi.mock('@/lib/outreachChannelAllocation', () => ({
  allocateChannelsForDay: (...args: unknown[]) => allocateChannelsForDayMock(...args),
}));

vi.mock('@/lib/outreachSellingDays', async () => {
  const actual = await vi.importActual<typeof import('@/lib/outreachSellingDays')>(
    '@/lib/outreachSellingDays',
  );
  return {
    ...actual,
    zonedLocalToUtcIso: (local: string) => `${local.slice(0, 10)}T19:00:00.000Z`,
  };
});

import { runOutreachNightlyPrep } from '@/lib/outreachNightlyPrep';
import { defaultOutreachGoalSettings } from '@/lib/outreachGoals';

function makeClient(overrides?: {
  existingRun?: Record<string, unknown> | null;
  insertError?: { message: string } | null;
  pendingMessageRows?: Array<Record<string, unknown>>;
}) {
  const existingRun = overrides?.existingRun ?? null;
  const runStore: { row: Record<string, unknown> | null } = {
    row: existingRun ? { ...existingRun } : null,
  };
  const pendingRows = overrides?.pendingMessageRows ?? [];

  const from = vi.fn((table: string) => {
    if (table === 'system_messages') {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = self;
      chain.in = self;
      chain.order = self;
      chain.range = async () => ({ data: pendingRows, error: null });
      return chain;
    }

    if (table !== 'outreach_automation_runs') {
      throw new Error(`unexpected table ${table}`);
    }
    return {
      select: () => {
        const filters: Record<string, unknown> = {};
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.eq = (col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        };
        chain.is = (col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        };
        chain.order = self;
        chain.limit = self;
        chain.maybeSingle = async () => {
          const row = runStore.row;
          if (!row) return { data: null, error: null };
          for (const [col, expected] of Object.entries(filters)) {
            const actual = row[col];
            if (expected === null) {
              if (actual != null) return { data: null, error: null };
            } else if (actual !== expected) {
              return { data: null, error: null };
            }
          }
          return { data: row, error: null };
        };
        return chain;
      },
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            if (overrides?.insertError) {
              return { data: null, error: overrides.insertError };
            }
            const inserted = {
              id: 'run-1',
              run_date: row.run_date,
              kind: row.kind ?? 'nightly_prep',
              status: 'running',
              trigger: row.trigger,
              capacity: row.capacity ?? 0,
              pending_before: 0,
              net_capacity: 0,
              selected_count: 0,
              produced_count: 0,
              skipped_count: 0,
              failed_count: 0,
              shortfall: 0,
              channel_allocation: {},
              error: null,
              target_errors: [],
              reason: null,
              operational_territory_id: row.operational_territory_id ?? null,
              store_territory_code: row.store_territory_code ?? null,
              crm_region: row.crm_region ?? null,
              started_at: new Date().toISOString(),
              finished_at: null,
              triggered_by: row.triggered_by ?? null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            runStore.row = inserted;
            return { data: inserted, error: null };
          },
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          if (runStore.row) {
            runStore.row = { ...runStore.row, ...patch };
          }
          return { error: null };
        },
      }),
    };
  });

  return { from, _runStore: runStore } as unknown as {
    from: typeof from;
    _runStore: typeof runStore;
  };
}

describe('outreachNightlyPrep module invariants', () => {
  it('does not import Resend or send helpers', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'outreachNightlyPrep.ts'), 'utf8');
    expect(src).not.toMatch(/from ['"][^'"]*resend[^'"]*['"]/i);
    expect(src).not.toMatch(/sendOgrProductOutreachEmail/);
    expect(src).not.toMatch(/sendOgrProductEmail/);
    expect(src).not.toMatch(/sendAgentProductOutreachDraft/);
  });
});

describe('runOutreachNightlyPrep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadOutreachGoalDashboardSnapshotMock.mockResolvedValue({
      ok: true,
      snapshot: {
        settings: defaultOutreachGoalSettings(),
        pace: { recommendedDailySends: 3, goalMet: false },
        performance: null,
      },
    });
    refreshPersistedLeadRulesMock.mockResolvedValue({
      ok: true,
      result: {
        rules: { version: 'v1-provisional' },
        source: 'provisional',
        meta: { globalRate: 0.015, byState: {}, adjustedFields: [] },
        persisted: false,
      },
    });
    allocateChannelsForDayMock.mockReturnValue({
      channelOrder: ['grocery'],
      slotsByChannel: { grocery: 3 },
    });
    selectOutreachTargetsMock.mockResolvedValue({
      ok: true,
      targets: [
        { prospectId: 1, preparationDate: '2026-08-13' },
        { prospectId: 2, preparationDate: '2026-08-13' },
      ],
      excluded: [],
    });
    generateOgrProductOutreachDraftsMock.mockResolvedValue({
      ok: true,
      results: [
        { prospectId: 1, draftId: 'd1' },
        { prospectId: 2, draftId: 'd2' },
      ],
    });
  });

  it('inserts drafts and never calls generate with regenerate true', async () => {
    const client = makeClient();
    const result = await runOutreachNightlyPrep({
      client: client as never,
      trigger: 'cron',
      preparationDate: '2026-08-13',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.producedCount).toBe(2);
    expect(result.run.status).toBe('succeeded');
    expect(generateOgrProductOutreachDraftsMock).toHaveBeenCalled();
    const genArg = generateOgrProductOutreachDraftsMock.mock.calls[0][1];
    expect(genArg.regenerate).toBe(false);
    expect(genArg.copyMode).toBe('generic_stub');
    expect(genArg.automationRunId).toBe('run-1');
  });

  it('passes shared channelAllocation and uniform weights to selectOutreachTargets', async () => {
    const client = makeClient();
    await runOutreachNightlyPrep({
      client: client as never,
      trigger: 'cron',
      preparationDate: '2026-08-13',
    });

    expect(allocateChannelsForDayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        preparationDate: '2026-08-13',
        capacity: 3,
        weights: undefined,
      }),
    );

    const selectArg = selectOutreachTargetsMock.mock.calls[0][1];
    expect(selectArg.channelAllocation).toEqual(
      expect.objectContaining({
        channelOrder: ['grocery'],
        slotsByChannel: { grocery: 3 },
        meta: expect.objectContaining({ weightSource: 'uniform', weights: undefined }),
      }),
    );
    expect(selectArg.weights).toBeUndefined();
    expect(selectArg.productWeightSource).toBe('uniform');
    expect(selectArg.productWeights).toBeUndefined();
    expect(selectArg.fitBandWeightSource).toBe('uniform');
    expect(selectArg.fitBandWeights).toBeUndefined();
  });

  it('passes measured weights when performance clears global gate', async () => {
    loadOutreachGoalDashboardSnapshotMock.mockResolvedValue({
      ok: true,
      snapshot: {
        settings: defaultOutreachGoalSettings(),
        pace: { recommendedDailySends: 3, goalMet: false },
        performance: {
          lookbackDays: 90,
          minAttributedConversions: 8,
          byChannel: [
            {
              key: 'golf_retail',
              label: 'Golf',
              sends: 50,
              attributedConversions: 5,
              conversionRate: 0.1,
              confidence: 'insufficient',
            },
            {
              key: 'marine_retail',
              label: 'Marine',
              sends: 50,
              attributedConversions: 3,
              conversionRate: 0.06,
              confidence: 'insufficient',
            },
          ],
          byProduct: [
            {
              key: 'p-high',
              label: 'High',
              sends: 50,
              attributedConversions: 5,
              conversionRate: 0.1,
              confidence: 'insufficient',
            },
            {
              key: 'p-low',
              label: 'Low',
              sends: 50,
              attributedConversions: 3,
              conversionRate: 0.06,
              confidence: 'insufficient',
            },
          ],
          byFitBand: [
            {
              key: '8-10',
              label: 'Fit 8-10',
              sends: 50,
              attributedConversions: 5,
              conversionRate: 0.1,
              confidence: 'insufficient',
            },
            {
              key: '1-5',
              label: 'Fit 1-5',
              sends: 50,
              attributedConversions: 3,
              conversionRate: 0.06,
              confidence: 'insufficient',
            },
          ],
          byLeadState: [],
          attributionCohort: { rows: [] },
        },
      },
    });

    const client = makeClient();
    await runOutreachNightlyPrep({
      client: client as never,
      trigger: 'cron',
      preparationDate: '2026-08-13',
    });

    expect(allocateChannelsForDayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        weights: expect.objectContaining({
          golf_retail: expect.any(Number),
          marine_retail: expect.any(Number),
        }),
      }),
    );

    const selectArg = selectOutreachTargetsMock.mock.calls[0][1];
    expect(selectArg.meta?.weightSource).toBeUndefined();
    expect(selectArg.channelAllocation.meta).toEqual(
      expect.objectContaining({ weightSource: 'measured' }),
    );
    expect(selectArg.weights.golf_retail).toBeGreaterThan(selectArg.weights.marine_retail);
    expect(selectArg.productWeightSource).toBe('measured');
    expect(selectArg.productWeights.get('p-high')).toBeGreaterThan(
      selectArg.productWeights.get('p-low'),
    );
    expect(selectArg.globalProductWeight).toEqual(expect.any(Number));
    expect(selectArg.fitBandWeightSource).toBe('measured');
    expect(selectArg.fitBandWeights.get('8-10')).toBeGreaterThan(
      selectArg.fitBandWeights.get('1-5'),
    );
    expect(selectArg.globalFitBandWeight).toEqual(expect.any(Number));
  });

  it('returns existing succeeded run as noop (no duplicate drafts)', async () => {
    const client = makeClient({
      existingRun: {
        id: 'run-exist',
        run_date: '2026-08-13',
        kind: 'nightly_prep',
        status: 'succeeded',
        trigger: 'cron',
        capacity: 3,
        pending_before: 0,
        net_capacity: 3,
        selected_count: 2,
        produced_count: 2,
        skipped_count: 0,
        failed_count: 0,
        shortfall: 1,
        channel_allocation: {},
        error: null,
        target_errors: [],
        reason: null,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        triggered_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
    const result = await runOutreachNightlyPrep({
      client: client as never,
      trigger: 'manual',
      preparationDate: '2026-08-13',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.noop).toBe(true);
    expect(selectOutreachTargetsMock).not.toHaveBeenCalled();
    expect(generateOgrProductOutreachDraftsMock).not.toHaveBeenCalled();
  });

  it('returns empty_pool when selection yields zero with net capacity', async () => {
    selectOutreachTargetsMock.mockResolvedValue({ ok: true, targets: [], excluded: [] });
    const client = makeClient();
    const result = await runOutreachNightlyPrep({
      client: client as never,
      trigger: 'cron',
      preparationDate: '2026-08-13',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.status).toBe('empty_pool');
    expect(result.run.producedCount).toBe(0);
    expect(generateOgrProductOutreachDraftsMock).not.toHaveBeenCalled();
  });

  it('marks partial when some AI failures and some drafts produced', async () => {
    generateOgrProductOutreachDraftsMock.mockResolvedValue({
      ok: true,
      results: [
        { prospectId: 1, draftId: 'd1' },
        { prospectId: 2, error: 'AI failed' },
      ],
    });
    const client = makeClient();
    const result = await runOutreachNightlyPrep({
      client: client as never,
      trigger: 'cron',
      preparationDate: '2026-08-13',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.status).toBe('partial');
    expect(result.run.producedCount).toBe(1);
    expect(result.run.failedCount).toBe(1);
    expect(result.run.targetErrors).toEqual([{ prospectId: 2, error: 'AI failed' }]);
  });

  it('succeeds with already_at_pace when pending meets capacity', async () => {
    const client = makeClient({
      pendingMessageRows: [
        {
          id: 'a',
          automation_run_id: null,
          payload: { generation: { preparationDate: '2026-08-13' } },
        },
        {
          id: 'b',
          automation_run_id: null,
          payload: { generation: { preparationDate: '2026-08-13' } },
        },
        {
          id: 'c',
          automation_run_id: null,
          payload: { generation: { preparationDate: '2026-08-13' } },
        },
      ],
    });
    const result = await runOutreachNightlyPrep({
      client: client as never,
      trigger: 'cron',
      preparationDate: '2026-08-13',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.status).toBe('succeeded');
    expect(result.run.reason).toBe('already_at_pace');
    expect(result.run.netCapacity).toBe(0);
    expect(selectOutreachTargetsMock).not.toHaveBeenCalled();
  });

  it('regional mode uses fixed limit, fit_score rank, and ops filters', async () => {
    const client = makeClient();
    const result = await runOutreachNightlyPrep({
      client: client as never,
      trigger: 'manual',
      preparationDate: '2026-08-25',
      operationalTerritoryId: 'ops-pnw-west',
      storeTerritoryCode: 'or',
      limit: 25,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.kind).toBe('manual_regional_prep');
    expect(result.run.capacity).toBe(25);
    expect(selectOutreachTargetsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        capacity: 25,
        operationalTerritoryId: 'ops-pnw-west',
        storeTerritoryCode: 'or',
        rankMode: 'fit_score',
        skipChannelAllocation: true,
      }),
    );
  });

  it('regional empty_pool is retryable (not terminal noop)', async () => {
    const client = makeClient({
      existingRun: {
        id: 'run-empty',
        run_date: '2026-08-25',
        kind: 'manual_regional_prep',
        status: 'empty_pool',
        trigger: 'manual',
        capacity: 25,
        pending_before: 0,
        net_capacity: 25,
        selected_count: 0,
        produced_count: 0,
        skipped_count: 0,
        failed_count: 0,
        shortfall: 25,
        channel_allocation: {},
        error: null,
        target_errors: [],
        reason: 'empty_pool',
        operational_territory_id: 'ops-pnw-west',
        store_territory_code: 'or',
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        triggered_by: 'staff-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
    const result = await runOutreachNightlyPrep({
      client: client as never,
      trigger: 'manual',
      preparationDate: '2026-08-25',
      operationalTerritoryId: 'ops-pnw-west',
      storeTerritoryCode: 'or',
      limit: 25,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.noop).toBe(false);
    expect(selectOutreachTargetsMock).toHaveBeenCalled();
  });

  it('regional prep for a driveable CRM region does not noop an all-regions run', async () => {
    const client = makeClient({
      existingRun: {
        id: 'run-all-or',
        run_date: '2026-08-25',
        kind: 'manual_regional_prep',
        status: 'succeeded',
        trigger: 'manual',
        capacity: 25,
        pending_before: 0,
        net_capacity: 25,
        selected_count: 1,
        produced_count: 1,
        skipped_count: 0,
        failed_count: 0,
        shortfall: 24,
        channel_allocation: {},
        error: null,
        target_errors: [],
        reason: null,
        operational_territory_id: 'ops-pnw-west',
        store_territory_code: 'or',
        crm_region: null,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        triggered_by: 'staff-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
    const result = await runOutreachNightlyPrep({
      client: client as never,
      trigger: 'manual',
      preparationDate: '2026-08-25',
      operationalTerritoryId: 'ops-pnw-west',
      storeTerritoryCode: 'or',
      crmRegion: 'Oregon Coast',
      limit: 25,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.noop).toBe(false);
    expect(selectOutreachTargetsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        crmRegion: 'Oregon Coast',
      }),
    );
  });
});
