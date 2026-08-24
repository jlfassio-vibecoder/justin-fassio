import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAccountResearchContext } from '@/lib/accountResearch/context';
import { readSearchCandidates } from '@/lib/accountResearch/candidates';
import { prospectFixture } from '@/lib/prospectFixture';

const generateTextMock = vi.fn();
const exaSearchMock = vi.fn(() => ({ type: 'mock-tool' }));

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  stepCountIs: (n: number) => ({ type: 'stepCount', n }),
}));

vi.mock('@/lib/aiGatewayEnv', () => ({
  ensureAiGatewayApiKey: () => 'vck_test',
  hasAiGatewayAuth: () => true,
  LOCAL_AI_GATEWAY_AUTH_HELP: 'missing key',
  staffAiGateway: () => ({
    tools: {
      exaSearch: (opts?: Record<string, unknown>) =>
        (exaSearchMock as (o?: unknown) => unknown)(opts),
    },
  }),
  staffGatewayModel: () => 'openai/gpt-4o',
}));

import { executeSocialPlatformSearch } from '@/lib/accountResearch/socialSourceSearch';

const ctx = buildAccountResearchContext({
  prospect: prospectFixture({
    id: 27,
    name: 'Spallumcheen Golf & Country Club',
    city: 'Vernon',
    website: 'https://spallumcheengolf.com/',
  }),
});

describe('executeSocialPlatformSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('discovers a profile from the scraped website link without any Exa call', async () => {
    const result = await executeSocialPlatformSearch({
      platform: 'instagram',
      ctx,
      websiteSocialLinks: {
        instagram: {
          url: 'https://instagram.com/spallumcheengolf',
          handle: 'spallumcheengolf',
          source: 'html_anchor',
        },
      },
    });

    expect(generateTextMock).not.toHaveBeenCalled();
    expect(exaSearchMock).not.toHaveBeenCalled();
    expect(result.status).toBe('succeeded');
    expect(result.resolvedPublicUrl).toBeNull();
    expect(result.citations).toHaveLength(0);
    expect(result.socialMetadata.resolution_method).toBe('website_html_link');
    const candidates = readSearchCandidates(result.providerMetadata);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.url).toContain('instagram.com/spallumcheengolf');
  });

  it('reports no_profile with no Exa fallback when the site has no link for the platform', async () => {
    const result = await executeSocialPlatformSearch({
      platform: 'instagram',
      ctx,
      websiteSocialLinks: {},
    });

    expect(generateTextMock).not.toHaveBeenCalled();
    expect(exaSearchMock).not.toHaveBeenCalled();
    expect(result.confirmedProfile).toBeNull();
    expect(result.resolvedPublicUrl).toBeNull();
    expect(result.citations).toHaveLength(0);
    expect(result.status).toBe('none_indexed');
    expect(result.socialMetadata.empty_outcome).toBe('no_profile');
    const candidates = readSearchCandidates(result.providerMetadata);
    expect(candidates).toHaveLength(0);
  });

  it('uses staff-locked facebook.com/SpallGolf for activity and does not rewrite the URL', async () => {
    generateTextMock.mockResolvedValueOnce({
      toolResults: [
        {
          output: {
            results: [
              {
                url: 'https://www.facebook.com/SpallGolf/posts/123',
                title: 'Post',
                snippet: 'Open',
              },
            ],
          },
        },
      ],
    });

    const locked = 'https://www.facebook.com/SpallGolf';
    const result = await executeSocialPlatformSearch({
      platform: 'facebook',
      ctx,
      websiteSocialLinks: {},
      lockedUrl: locked,
    });

    expect(result.resolvedPublicUrl).toContain('facebook.com/SpallGolf');
    expect(result.confirmedProfile?.handle).toMatch(/spallgolf/i);
    expect(result.citations.some((c) => /facebook\.com\/SpallGolf/i.test(c.url))).toBe(true);
  });
});
