import { describe, expect, it, vi } from 'vitest';
import { OUTREACH_LEAD_RULES } from '@/lib/outreachLeadRules';
import { resolveOutreachLeadRules } from '@/lib/resolveOutreachLeadRules';

const getOutreachGoalSettingsMock = vi.fn();
const refreshPersistedLeadRulesMock = vi.fn();
const loadOutreachPerformanceReportMock = vi.fn();
const computeCalibratedLeadRulesMock = vi.fn();

vi.mock('@/lib/outreachGoals', () => ({
  getOutreachGoalSettings: (...args: unknown[]) => getOutreachGoalSettingsMock(...args),
  defaultOutreachGoalSettings: () => ({
    id: '00000000-0000-4000-8000-000000000001',
    monthlyTarget: 5,
    planningConversionRate: 0.015,
    minAttributedConversions: 8,
    lookbackDays: 90,
    lastTouchWindowDays: 45,
    smoothingAlpha: 0.3,
    measuredRateFloor: 0.005,
    measuredRateCap: 0.06,
    paceFloor: 1,
    paceCap: 25,
    businessTimezone: 'America/Vancouver',
    sellingDayMode: 'weekdays',
    leadRules: null,
    leadRulesSource: null,
    leadRulesMeta: null,
    leadRulesComputedAt: null,
    updatedAt: new Date(0).toISOString(),
    updatedBy: null,
  }),
}));

vi.mock('@/lib/refreshPersistedLeadRules', () => ({
  refreshPersistedLeadRules: (...args: unknown[]) => refreshPersistedLeadRulesMock(...args),
}));

vi.mock('@/lib/outreachPerformance', () => ({
  loadOutreachPerformanceReport: (...args: unknown[]) => loadOutreachPerformanceReportMock(...args),
}));

vi.mock('@/lib/outreachLeadRuleCalibration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/outreachLeadRuleCalibration')>();
  return {
    ...actual,
    computeCalibratedLeadRules: (...args: unknown[]) => computeCalibratedLeadRulesMock(...args),
  };
});

describe('resolveOutreachLeadRules', () => {
  it('returns cached rules from settings when present', async () => {
    getOutreachGoalSettingsMock.mockResolvedValue({
      ok: true,
      settings: {
        id: 'goal-1',
        leadRules: { ...OUTREACH_LEAD_RULES, version: 'v1-measured', hotScoreMin: 12 },
        leadRulesSource: 'measured',
        leadRulesMeta: { globalRate: 0.02, byState: {}, adjustedFields: ['hotScoreMin'] },
        leadRulesComputedAt: '2026-08-12T00:00:00Z',
      },
    });

    const result = await resolveOutreachLeadRules({ client: {} as never });

    expect(result.source).toBe('measured');
    expect(result.rules.hotScoreMin).toBe(12);
    expect(refreshPersistedLeadRulesMock).not.toHaveBeenCalled();
    expect(loadOutreachPerformanceReportMock).not.toHaveBeenCalled();
  });

  it('refreshes persisted rules when cache is missing', async () => {
    getOutreachGoalSettingsMock.mockResolvedValue({
      ok: true,
      settings: {
        id: 'goal-1',
        leadRules: null,
        leadRulesSource: null,
        leadRulesMeta: null,
        leadRulesComputedAt: null,
      },
    });
    refreshPersistedLeadRulesMock.mockResolvedValue({
      ok: true,
      result: {
        rules: OUTREACH_LEAD_RULES,
        source: 'provisional',
        meta: { globalRate: 0.015, byState: {}, adjustedFields: [] },
        persisted: true,
      },
    });

    const result = await resolveOutreachLeadRules({
      client: {} as never,
      performance: {
        lookbackDays: 90,
        minAttributedConversions: 8,
        byChannel: [],
        byProduct: [],
        byFitBand: [],
        byLeadState: [],
        attributionCohort: { rows: [] },
      },
    });

    expect(result.source).toBe('provisional');
    expect(refreshPersistedLeadRulesMock).toHaveBeenCalled();
  });
});
