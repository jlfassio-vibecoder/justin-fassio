import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApprovedStaffClientMock = vi.fn();
const listWarmLeadsMock = vi.fn();
const listHotLeadsMock = vi.fn();
const listCallTodayMock = vi.fn();
const resolveOutreachLeadRulesMock = vi.fn();

vi.mock('@/lib/agentAuth', () => ({
  requireApprovedStaffClient: (...args: unknown[]) => requireApprovedStaffClientMock(...args),
}));

vi.mock('@/lib/resolveOutreachLeadRules', () => ({
  resolveOutreachLeadRules: (...args: unknown[]) => resolveOutreachLeadRulesMock(...args),
}));

vi.mock('@/lib/outreachLeadLists', () => ({
  listWarmLeads: (...args: unknown[]) => listWarmLeadsMock(...args),
  listHotLeads: (...args: unknown[]) => listHotLeadsMock(...args),
  listCallToday: (...args: unknown[]) => listCallTodayMock(...args),
}));

import { GET } from '@/pages/api/staff/outreach/leads';
import { OUTREACH_LEAD_RULES } from '@/lib/outreachLeadRules';

describe('GET /api/staff/outreach/leads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      supabase: {},
      userId: 'user-1',
    });
    listWarmLeadsMock.mockResolvedValue([{ prospectId: 1, leadState: 'warm' }]);
    listHotLeadsMock.mockResolvedValue([{ prospectId: 2, leadState: 'hot' }]);
    listCallTodayMock.mockResolvedValue([{ prospectId: 3, callToday: true }]);
    resolveOutreachLeadRulesMock.mockResolvedValue({
      rules: OUTREACH_LEAD_RULES,
      source: 'provisional',
      meta: { globalRate: 0, byState: {}, adjustedFields: [] },
    });
  });

  it('returns 401 when staff gate fails', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401 }),
    });
    const res = await GET({
      request: new Request('http://localhost/api/staff/outreach/leads?kind=warm'),
      url: new URL('http://localhost/api/staff/outreach/leads?kind=warm'),
    } as never);
    expect(res.status).toBe(401);
  });

  it('returns 400 when kind is missing or invalid', async () => {
    const res = await GET({
      request: new Request('http://localhost/api/staff/outreach/leads'),
      url: new URL('http://localhost/api/staff/outreach/leads'),
    } as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it('lists warm leads', async () => {
    const res = await GET({
      request: new Request('http://localhost/api/staff/outreach/leads?kind=warm'),
      url: new URL('http://localhost/api/staff/outreach/leads?kind=warm'),
    } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.kind).toBe('warm');
    expect(listWarmLeadsMock).toHaveBeenCalled();
    expect(body.leads).toHaveLength(1);
  });

  it('lists hot leads', async () => {
    const res = await GET({
      request: new Request('http://localhost/api/staff/outreach/leads?kind=hot'),
      url: new URL('http://localhost/api/staff/outreach/leads?kind=hot'),
    } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.kind).toBe('hot');
    expect(listHotLeadsMock).toHaveBeenCalled();
    expect(body.leads).toHaveLength(1);
  });

  it('lists call_today leads', async () => {
    const res = await GET({
      request: new Request('http://localhost/api/staff/outreach/leads?kind=call_today'),
      url: new URL('http://localhost/api/staff/outreach/leads?kind=call_today'),
    } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kind).toBe('call_today');
    expect(listCallTodayMock).toHaveBeenCalled();
  });
});
