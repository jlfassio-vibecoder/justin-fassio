import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSupabase } from '@/lib/agentAuth';
import type { AccountResearchRun } from '@/types/database';

const fetchOfficialWebsiteEvidenceMock = vi.fn();
const loadAccountResearchSnapshotMock = vi.fn();

vi.mock('@/lib/accountResearch/officialWebsiteSocialLinks', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/accountResearch/officialWebsiteSocialLinks')>();
  return {
    ...actual,
    fetchOfficialWebsiteEvidence: (...args: unknown[]) => fetchOfficialWebsiteEvidenceMock(...args),
  };
});

vi.mock('@/lib/accountResearch/snapshot', () => ({
  loadAccountResearchSnapshot: (...args: unknown[]) => loadAccountResearchSnapshotMock(...args),
}));

import { lockAccountResearchSourceAndRefresh } from '@/lib/accountResearch/lockSource';

const baseRun = {
  id: 'run-1',
  retailer_id: 7,
  status: 'succeeded',
  requested_scope: 'website',
  identity_confidence: 'unresolved',
  identity_review_status: 'pending',
  identity_resolution: null,
  resolved_website: null,
  provider_metadata: {},
  research_brief: null,
  provider: 'exa',
  error: null,
  created_at: '2026-08-25T00:00:00.000Z',
  completed_at: '2026-08-25T00:00:00.000Z',
  started_at: '2026-08-25T00:00:00.000Z',
} as AccountResearchRun;

function buildSupabaseMock() {
  const runUpdates: Record<string, unknown>[] = [];

  const supabase = {
    rpc: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
    from: vi.fn((table: string) => {
      if (table === 'account_research_runs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [baseRun],
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            runUpdates.push(payload);
            return {
              eq: vi.fn().mockResolvedValue({ error: null }),
            };
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    }),
  } as unknown as AgentSupabase;

  return { supabase, runUpdates };
}

describe('lockAccountResearchSourceAndRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchOfficialWebsiteEvidenceMock.mockResolvedValue({
      links: {},
      shopifyEvidence: { found: false, evidenceUrl: null },
      fetchUrl: 'https://facebook.com/ShopName',
    });
    loadAccountResearchSnapshotMock.mockResolvedValue(null);
  });

  it('seeds facebook in website_social_links when staff locks a Facebook URL as website', async () => {
    const { supabase, runUpdates } = buildSupabaseMock();
    const facebookUrl = 'https://facebook.com/ShopName';

    const result = await lockAccountResearchSourceAndRefresh({
      supabase,
      retailerId: 7,
      sourceType: 'website',
      url: facebookUrl,
    });

    expect(result.ok).toBe(true);
    expect(runUpdates).toHaveLength(1);
    expect(runUpdates[0]?.identity_resolution).toBe(
      'Staff locked social profile as primary web presence',
    );
    expect(runUpdates[0]?.resolved_website).toBe(facebookUrl);
    const metadata = runUpdates[0]?.provider_metadata as {
      website_social_links?: { facebook?: { url: string; source: string } };
    };
    expect(metadata.website_social_links?.facebook).toMatchObject({
      url: facebookUrl,
      source: 'staff_lock',
    });
  });

  it('uses standard website identity copy for a non-social URL', async () => {
    const { supabase, runUpdates } = buildSupabaseMock();
    const websiteUrl = 'https://trailoutfitters.com';

    const result = await lockAccountResearchSourceAndRefresh({
      supabase,
      retailerId: 7,
      sourceType: 'website',
      url: websiteUrl,
    });

    expect(result.ok).toBe(true);
    expect(runUpdates[0]?.identity_resolution).toBe('Staff locked official website');
    expect(runUpdates[0]?.resolved_website).toMatch(/^https:\/\/trailoutfitters\.com\/?$/);
    const metadata = runUpdates[0]?.provider_metadata as {
      website_social_links?: Record<string, unknown>;
    };
    expect(metadata.website_social_links?.facebook).toBeUndefined();
  });
});
