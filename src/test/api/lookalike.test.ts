import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const requireApprovedOwnerClientMock = vi.fn();

vi.mock('@/lib/agentAuth', () => ({
  requireApprovedOwnerClient: (...args: unknown[]) => requireApprovedOwnerClientMock(...args),
  requireApprovedStaffClient: vi.fn(),
}));

import { POST as startPost } from '@/pages/api/staff/lookalike/jobs';
import { GET as seedsGet } from '@/pages/api/staff/lookalike/seeds';
import { POST as processPost } from '@/pages/api/staff/lookalike/jobs/[id]/process';
import { GET as statusGet } from '@/pages/api/staff/lookalike/jobs/[id]/status';
import { POST as cancelPost } from '@/pages/api/staff/lookalike/jobs/[id]/cancel';
import { POST as reviewPost } from '@/pages/api/staff/lookalike/jobs/[id]/candidates/[candidateId]/review';

const JOB_ID = '00000000-0000-4000-8000-000000000001';
const CANDIDATE_ID = '00000000-0000-4000-8000-000000000002';
const root = process.cwd();

describe('lookalike APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 for reps on start, seeds, process, status, cancel, and review', async () => {
    requireApprovedOwnerClientMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), { status: 403 }),
    });

    const json = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' };
    const startRes = await startPost({
      request: new Request('http://localhost/api/staff/lookalike/jobs', json),
    } as never);
    const seedsRes = await seedsGet({
      request: new Request('http://localhost/api/staff/lookalike/seeds?sales_line_id=x', {
        method: 'GET',
      }),
    } as never);
    const processRes = await processPost({
      request: new Request(`http://localhost/api/staff/lookalike/jobs/${JOB_ID}/process`, json),
      params: { id: JOB_ID },
    } as never);
    const statusRes = await statusGet({
      request: new Request(`http://localhost/api/staff/lookalike/jobs/${JOB_ID}/status`, {
        method: 'GET',
      }),
      params: { id: JOB_ID },
    } as never);
    const cancelRes = await cancelPost({
      request: new Request(`http://localhost/api/staff/lookalike/jobs/${JOB_ID}/cancel`, json),
      params: { id: JOB_ID },
    } as never);
    const reviewRes = await reviewPost({
      request: new Request(
        `http://localhost/api/staff/lookalike/jobs/${JOB_ID}/candidates/${CANDIDATE_ID}/review`,
        json,
      ),
      params: { id: JOB_ID, candidateId: CANDIDATE_ID },
    } as never);

    expect(startRes.status).toBe(403);
    expect(seedsRes.status).toBe(403);
    expect(processRes.status).toBe(403);
    expect(statusRes.status).toBe(403);
    expect(cancelRes.status).toBe(403);
    expect(reviewRes.status).toBe(403);
  });

  it('uses owner JWT, prerender false, and no service role; process is rate-limited and line-gated', () => {
    const files = [
      'jobs.ts',
      'seeds.ts',
      'jobs/[id]/process.ts',
      'jobs/[id]/status.ts',
      'jobs/[id]/cancel.ts',
      'jobs/[id]/candidates/[candidateId]/review.ts',
    ];
    for (const file of files) {
      const src = readFileSync(resolve(root, `src/pages/api/staff/lookalike/${file}`), 'utf8');
      expect(src).toMatch(/export const prerender = false/);
      expect(src).toMatch(/requireLookalikeOwner|requireLookalikeJob|requireApprovedOwnerClient/);
      expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|getServiceRoleClient/);
    }
    const process = readFileSync(
      resolve(root, 'src/pages/api/staff/lookalike/jobs/[id]/process.ts'),
      'utf8',
    );
    expect(process).toMatch(/export const maxDuration = 60/);
    expect(process).toMatch(/checkAgentRateLimit/);
    expect(process).toMatch(/gateStaffAiContext/);
    expect(process).toMatch(/kind: 'line_level'/);

    const jobs = readFileSync(resolve(root, 'src/lib/lookalike/jobs.ts'), 'utf8');
    expect(jobs).toMatch(/nextProspectId/);
    expect(jobs).not.toMatch(/createEnrichedProspect\(/);
    expect(jobs).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|getServiceRoleClient/);

    const search = readFileSync(resolve(root, 'src/lib/lookalike/search.ts'), 'utf8');
    expect(search).toMatch(/US_OGR_FILL_BLANK_PERSONA/);
    expect(search).toMatch(/generateObject/);
    expect(search).not.toMatch(/createEnrichedProspect/);

    const modal = readFileSync(
      resolve(root, 'src/components/lookalike/FindLookalikesModal.tsx'),
      'utf8',
    );
    expect(modal).not.toMatch(/from '@\/lib\/lookalike\/search'/);
    expect(modal).not.toMatch(/from '@\/lib\/lookalike\/jobs'/);
    expect(modal).toMatch(/strokeWidth=\{2\.75\}/);
  });
});
