import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApprovedStaffClientMock = vi.fn();
const generateMock = vi.fn();
const loadSuggestionsMock = vi.fn();
const applyMock = vi.fn();
const rejectMock = vi.fn();
const loadProspectMock = vi.fn();

vi.mock('@/lib/agentAuth', () => ({
  requireApprovedStaffClient: (...args: unknown[]) => requireApprovedStaffClientMock(...args),
}));

vi.mock('@/lib/accountResearch/suggestions', () => ({
  generateAccountResearchSuggestions: (...args: unknown[]) => generateMock(...args),
  loadRunSuggestions: (...args: unknown[]) => loadSuggestionsMock(...args),
}));

vi.mock('@/lib/accountResearch/applySuggestion', () => ({
  applyAccountResearchSuggestion: (...args: unknown[]) => applyMock(...args),
  rejectAccountResearchSuggestion: (...args: unknown[]) => rejectMock(...args),
  loadProspectAfterApply: (...args: unknown[]) => loadProspectMock(...args),
}));

import { POST as POST_GENERATE } from '@/pages/api/staff/account-research/[runId]/suggestions/generate';
import { GET as GET_SUGGESTIONS } from '@/pages/api/staff/account-research/[runId]/suggestions/index';
import { POST as POST_APPLY } from '@/pages/api/staff/account-research/suggestions/[suggestionId]/apply';
import { POST as POST_REJECT } from '@/pages/api/staff/account-research/suggestions/[suggestionId]/reject';

const RUN_ID = '00000000-0000-4000-8000-000000000101';
const SUGGESTION_ID = '00000000-0000-4000-8000-000000000202';

describe('staff account research suggestions APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generate requires approved staff', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), { status: 403 }),
    });
    const res = await POST_GENERATE({
      request: new Request('http://localhost/api/staff/account-research/x/suggestions/generate', {
        method: 'POST',
      }),
      params: { runId: RUN_ID },
    } as never);
    expect(res.status).toBe(403);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it('generate returns suggestions for eligible run', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({ ok: true, supabase: {}, userId: 'u1' });
    generateMock.mockResolvedValue({
      ok: true,
      outcome: 'generated',
      suggestions: [{ field_path: 'website' }],
    });
    const res = await POST_GENERATE({
      request: new Request('http://localhost/api/staff/account-research/x/suggestions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceRegenerate: false }),
      }),
      params: { runId: RUN_ID },
    } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.outcome).toBe('generated');
  });

  it('lists suggestions for a run', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({ ok: true, supabase: {} });
    loadSuggestionsMock.mockResolvedValue({ ok: true, suggestions: [{ id: SUGGESTION_ID }] });
    const res = await GET_SUGGESTIONS({
      request: new Request('http://localhost/api/staff/account-research/x/suggestions'),
      params: { runId: RUN_ID },
    } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions).toHaveLength(1);
  });

  it('apply returns prospect snapshot', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({ ok: true, supabase: {} });
    applyMock.mockResolvedValue({ ok: true, outcome: 'applied', retailerId: 42 });
    loadProspectMock.mockResolvedValue({ id: 42, name: 'Trail Outfitters' });
    const res = await POST_APPLY({
      request: new Request('http://localhost/api/staff/account-research/suggestions/x/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmVerifiedOverwrite: true }),
      }),
      params: { suggestionId: SUGGESTION_ID },
    } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcome).toBe('applied');
    expect(body.prospect?.id).toBe(42);
  });

  it('reject is idempotent', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({ ok: true, supabase: {} });
    rejectMock.mockResolvedValue({ ok: true, outcome: 'already_rejected' });
    const res = await POST_REJECT({
      request: new Request('http://localhost/api/staff/account-research/suggestions/x/reject', {
        method: 'POST',
      }),
      params: { suggestionId: SUGGESTION_ID },
    } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcome).toBe('already_rejected');
  });
});
