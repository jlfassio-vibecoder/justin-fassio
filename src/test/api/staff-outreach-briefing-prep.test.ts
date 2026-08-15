import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApprovedStaffClientMock = vi.fn();
const assembleOutreachBriefingMock = vi.fn();
const runOutreachNightlyPrepMock = vi.fn();
const getOutreachGoalSettingsMock = vi.fn();

vi.mock('@/lib/agentAuth', () => ({
  requireApprovedStaffClient: (...args: unknown[]) => requireApprovedStaffClientMock(...args),
}));

vi.mock('@/lib/outreachBriefing', () => ({
  assembleOutreachBriefing: (...args: unknown[]) => assembleOutreachBriefingMock(...args),
}));

vi.mock('@/lib/outreachNightlyPrep', () => ({
  runOutreachNightlyPrep: (...args: unknown[]) => runOutreachNightlyPrepMock(...args),
  defaultNightlyPrepRunDate: () => '2026-08-13',
}));

vi.mock('@/lib/outreachGoals', () => ({
  getOutreachGoalSettings: (...args: unknown[]) => getOutreachGoalSettingsMock(...args),
}));

vi.mock('@/lib/outreachSelectTargets', () => ({
  formatOutreachPreparationDate: () => '2026-08-12',
}));

vi.mock('@/lib/outreachSellingDays', () => ({
  isWeekdayIso: () => true,
}));

import { GET as GET_BRIEFING } from '@/pages/api/staff/outreach/briefing';
import { POST as POST_PREP } from '@/pages/api/staff/outreach/prep';

describe('staff outreach briefing + prep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      supabase: {},
      userId: 'staff-1',
    });
    assembleOutreachBriefingMock.mockResolvedValue({
      ok: true,
      briefing: {
        asOfDate: '2026-08-12',
        sellingDate: '2026-08-12',
        prep: { run: null, status: 'missing', message: 'No prep' },
        goal: {
          monthlyTarget: 5,
          mtdAccounts: 1,
          remainingGoal: 4,
          projectedAttainment: 5,
          recommendedDailySends: 10,
          rateSource: 'planning',
          goalMet: false,
        },
        drafts: [
          {
            draftId: 'd1',
            prospectId: 9,
            prospectName: 'Store',
            catalogItemId: 'c1',
            productName: 'Hat',
            productSku: 'SKU-1',
            productSlug: 'hat',
            toEmail: 'a@b.com',
            primaryChannel: 'grocery',
            createdAt: '2026-08-12T00:00:00.000Z',
          },
        ],
        channelAllocation: null,
        callToday: [],
        hot: [],
        warm: [],
        recentEngagement: [],
        recentConversions: [],
        performance: null,
      },
    });
    getOutreachGoalSettingsMock.mockResolvedValue({
      ok: true,
      settings: { businessTimezone: 'America/Vancouver' },
    });
    runOutreachNightlyPrepMock.mockResolvedValue({
      ok: true,
      noop: false,
      run: { id: 'run-1', status: 'succeeded' },
    });
  });

  it('GET briefing requires staff JWT', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    });
    const res = await GET_BRIEFING({
      request: new Request('http://localhost/api/staff/outreach/briefing'),
      url: new URL('http://localhost/api/staff/outreach/briefing'),
    } as never);
    expect(res.status).toBe(401);
    expect(assembleOutreachBriefingMock).not.toHaveBeenCalled();
  });

  it('GET briefing returns assembled DTO with deep-link ids', async () => {
    const res = await GET_BRIEFING({
      request: new Request('http://localhost/api/staff/outreach/briefing'),
      url: new URL('http://localhost/api/staff/outreach/briefing'),
    } as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      briefing: {
        drafts: Array<{ draftId: string; prospectId: number; productSku: string }>;
        goal: { recommendedDailySends: number };
      };
    };
    expect(body.briefing.drafts[0]).toMatchObject({
      draftId: 'd1',
      prospectId: 9,
      productSku: 'SKU-1',
    });
    expect(body.briefing.goal.recommendedDailySends).toBe(10);
  });

  it('POST prep requires staff and runs orchestrator', async () => {
    const res = await POST_PREP({
      request: new Request('http://localhost/api/staff/outreach/prep', {
        method: 'POST',
        body: '{}',
      }),
    } as never);
    expect(res.status).toBe(200);
    expect(runOutreachNightlyPrepMock).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'manual', triggeredBy: 'staff-1' }),
    );
  });
});
