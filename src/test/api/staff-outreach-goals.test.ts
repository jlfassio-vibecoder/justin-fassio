import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApprovedStaffClientMock = vi.fn();
const getOutreachGoalSettingsMock = vi.fn();
const updateOutreachGoalSettingsMock = vi.fn();

vi.mock('@/lib/agentAuth', () => ({
  requireApprovedStaffClient: (...args: unknown[]) => requireApprovedStaffClientMock(...args),
}));

vi.mock('@/lib/outreachGoals', () => ({
  getOutreachGoalSettings: (...args: unknown[]) => getOutreachGoalSettingsMock(...args),
  updateOutreachGoalSettings: (...args: unknown[]) => updateOutreachGoalSettingsMock(...args),
}));

import { GET, PATCH } from '@/pages/api/staff/outreach/goals';

describe('GET/PATCH /api/staff/outreach/goals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      supabase: {},
      userId: 'user-1',
    });
    getOutreachGoalSettingsMock.mockResolvedValue({
      ok: true,
      settings: { monthlyTarget: 5, planningConversionRate: 0.015 },
    });
    updateOutreachGoalSettingsMock.mockResolvedValue({
      ok: true,
      settings: { monthlyTarget: 6, planningConversionRate: 0.015 },
    });
  });

  it('GET returns settings for approved staff', async () => {
    const res = await GET({
      request: new Request('http://localhost/api/staff/outreach/goals'),
    } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.settings.monthlyTarget).toBe(5);
  });

  it('PATCH updates monthly target', async () => {
    const res = await PATCH({
      request: new Request('http://localhost/api/staff/outreach/goals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyTarget: 6 }),
      }),
    } as never);
    expect(res.status).toBe(200);
    expect(updateOutreachGoalSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({ monthlyTarget: 6, updatedBy: 'user-1' }),
      {},
    );
  });
});
