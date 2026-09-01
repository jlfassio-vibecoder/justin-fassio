import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApprovedStaffClientMock = vi.fn();
const snoozeFollowUpUntilTomorrowMock = vi.fn();

vi.mock('@/lib/agentAuth', () => ({
  requireApprovedStaffClient: (...args: unknown[]) => requireApprovedStaffClientMock(...args),
}));

vi.mock('@/lib/outreachFollowUpSnooze', () => ({
  snoozeFollowUpUntilTomorrow: (...args: unknown[]) => snoozeFollowUpUntilTomorrowMock(...args),
}));

import { POST } from '@/pages/api/staff/outreach/follow-up-snooze';

function requestWith(body: unknown): Parameters<typeof POST>[0] {
  return {
    request: new Request('http://localhost/api/staff/outreach/follow-up-snooze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
      body: JSON.stringify(body),
    }),
  } as Parameters<typeof POST>[0];
}

describe('POST /api/staff/outreach/follow-up-snooze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      supabase: {},
      userId: 'user-1',
    });
    snoozeFollowUpUntilTomorrowMock.mockResolvedValue({
      ok: true,
      snoozedUntil: '2026-08-11',
    });
  });

  it('returns 401 when staff auth fails', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    });
    const res = await POST(requestWith({ prospectId: 12 }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when prospectId is missing', async () => {
    const res = await POST(requestWith({}));
    expect(res.status).toBe(400);
  });

  it('snoozes until tomorrow', async () => {
    const res = await POST(requestWith({ prospectId: 12 }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; snoozedUntil: string };
    expect(body.ok).toBe(true);
    expect(body.snoozedUntil).toBe('2026-08-11');
    expect(snoozeFollowUpUntilTomorrowMock).toHaveBeenCalledWith({}, 12);
  });
});
