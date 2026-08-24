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

  it('runs a single discovery search with the two-variable query', async () => {
    generateTextMock.mockResolvedValueOnce({
      toolResults: [
        {
          output: {
            results: [
              {
                url: 'https://instagram.com/spallumcheengolf',
                title: 'Spallumcheen Golf & Country Club',
                snippet: '',
              },
            ],
          },
        },
      ],
    });

    const result = await executeSocialPlatformSearch({
      platform: 'instagram',
      ctx,
      websiteSocialLinks: {},
    });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const expectedQuery =
      '"Spallumcheen Golf & Country Club" official Instagram profile site:instagram.com';
    expect(generateTextMock.mock.calls[0]?.[0]?.prompt).toContain(expectedQuery);
    expect(generateTextMock.mock.calls[0]?.[0]?.prompt).toContain(
      'Set the tool parameter "query" to exactly this string',
    );
    expect(generateTextMock.mock.calls[0]?.[0]?.prompt).toContain('exa_search');
    expect(result.queryText).toBe(expectedQuery);
    expect(result.socialMetadata.profile_query).toBe(expectedQuery);
    expect(result.resolvedPublicUrl).toBeNull();
    expect(result.citations).toHaveLength(0);
    expect(exaSearchMock).toHaveBeenCalledWith(
      expect.objectContaining({ includeDomains: ['instagram.com'] }),
    );
  });

  it('does not fabricate profile URL when hits are all posts', async () => {
    generateTextMock.mockResolvedValueOnce({
      toolResults: [
        {
          output: {
            results: [
              { url: 'https://instagram.com/reel/ABC', title: 'Reel', snippet: '' },
              { url: 'https://instagram.com/p/DEF', title: 'Post', snippet: '' },
            ],
          },
        },
      ],
    });

    const result = await executeSocialPlatformSearch({
      platform: 'instagram',
      ctx,
      websiteSocialLinks: {},
    });

    expect(result.confirmedProfile).toBeNull();
    expect(result.resolvedPublicUrl).toBeNull();
    expect(result.citations).toHaveLength(0);
    expect(result.status).toBe('none_indexed');
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const candidates = readSearchCandidates(result.providerMetadata);
    expect(candidates).toHaveLength(0);
  });

  it('drops marketplace noise and keeps facebook.com/SpallGolf as a lockable profile candidate', async () => {
    generateTextMock.mockResolvedValueOnce({
      toolResults: [
        {
          output: {
            results: [
              {
                url: 'https://www.facebook.com/marketplace/106956609336424/cacti',
                title: 'Cacti for sale',
                snippet: 'Kelowna',
              },
              {
                url: 'https://www.facebook.com/TheCountryClubID/',
                title: 'The Country Club',
                snippet: 'Idaho',
              },
              {
                url: 'https://www.facebook.com/SpallGolf',
                title: 'Spallumcheen Golf & Country Club',
                snippet: 'Vernon BC',
              },
            ],
          },
        },
      ],
    });

    const result = await executeSocialPlatformSearch({
      platform: 'facebook',
      ctx,
      websiteSocialLinks: {},
    });

    expect(result.status).toBe('succeeded');
    expect(result.confirmedProfile).toBeNull();
    expect(result.resolvedPublicUrl).toBeNull();
    expect(exaSearchMock).toHaveBeenCalledWith(
      expect.objectContaining({ includeDomains: ['facebook.com', 'fb.com'] }),
    );
    const candidates = readSearchCandidates(result.providerMetadata);
    expect(candidates.every((c) => !c.url.includes('marketplace'))).toBe(true);
    expect(candidates.some((c) => /facebook\.com\/spallgolf/i.test(c.url))).toBe(true);
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
