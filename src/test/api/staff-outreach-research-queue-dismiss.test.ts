import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApprovedStaffClientMock = vi.fn();
const dismissResearchQueueProspectMock = vi.fn();

vi.mock('@/lib/agentAuth', () => ({
  requireApprovedStaffClient: (...args: unknown[]) => requireApprovedStaffClientMock(...args),
}));

vi.mock('@/lib/outreachResearchQueueDismiss', () => ({
  dismissResearchQueueProspect: (...args: unknown[]) => dismissResearchQueueProspectMock(...args),
}));

import { POST } from '@/pages/api/staff/outreach/research-queue-dismiss';

describe('POST /api/staff/outreach/research-queue-dismiss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      supabase: {},
      userId: 'staff-1',
    });
    dismissResearchQueueProspectMock.mockResolvedValue({ ok: true });
  });

  it('rejects unauthenticated staff', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    });
    const res = await POST({
      request: new Request('http://localhost/api/staff/outreach/research-queue-dismiss', {
        method: 'POST',
        body: '{}',
      }),
    } as never);
    expect(res.status).toBe(401);
    expect(dismissResearchQueueProspectMock).not.toHaveBeenCalled();
  });

  it('validates prospectId', async () => {
    const res = await POST({
      request: new Request('http://localhost/api/staff/outreach/research-queue-dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    } as never);
    expect(res.status).toBe(400);
    expect(dismissResearchQueueProspectMock).not.toHaveBeenCalled();
  });

  it('dismisses the prospect', async () => {
    const res = await POST({
      request: new Request('http://localhost/api/staff/outreach/research-queue-dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId: 44 }),
      }),
    } as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(dismissResearchQueueProspectMock).toHaveBeenCalledWith(
      {},
      44,
      expect.objectContaining({ dismissedBy: 'staff-1' }),
    );
  });
});
