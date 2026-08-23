import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateTextMock = vi.fn();
const perplexitySearchMock = vi.fn(() => ({ type: 'mock-tool' }));

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  stepCountIs: (n: number) => ({ type: 'stepCount', n }),
  createGateway: () => ({
    tools: {
      perplexitySearch: (opts?: { maxResults?: number; searchDomainFilter?: string[] }) =>
        (perplexitySearchMock as (o?: unknown) => unknown)(opts),
    },
  }),
  gateway: {
    tools: {
      perplexitySearch: (opts?: { maxResults?: number; searchDomainFilter?: string[] }) =>
        (perplexitySearchMock as (o?: unknown) => unknown)(opts),
    },
  },
}));

vi.mock('@/lib/aiGatewayEnv', () => ({
  ensureAiGatewayApiKey: () => 'vck_test',
  hasAiGatewayAuth: () => true,
  LOCAL_AI_GATEWAY_AUTH_HELP: 'missing key',
  staffAiGateway: () => ({
    tools: {
      perplexitySearch: (opts?: { maxResults?: number; searchDomainFilter?: string[] }) =>
        (perplexitySearchMock as (o?: unknown) => unknown)(opts),
    },
  }),
  staffGatewayModel: () => 'openai/gpt-4o',
}));

import { executeAccountResearchSourceSearch } from '@/lib/accountResearch/provider';

describe('executeAccountResearchSourceSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes source-specific domain filter and harvests tool URLs', async () => {
    generateTextMock.mockResolvedValue({
      text: 'Instagram profile found.',
      toolResults: [
        {
          output: {
            results: [
              {
                url: 'https://www.instagram.com/trailoutfitters/',
                title: 'Trail Outfitters',
                snippet: 'New arrivals',
                date: null,
              },
            ],
          },
        },
      ],
    });

    const result = await executeAccountResearchSourceSearch({
      sourceType: 'instagram',
      ctx: { businessName: 'Trail Outfitters', city: 'Bend' },
    });

    expect(perplexitySearchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maxResults: 5,
        searchDomainFilter: ['instagram.com'],
      }),
    );
    expect(result.status).toBe('succeeded');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]?.url).toBe('https://instagram.com/trailoutfitters');
    expect(result.citations[0]?.publishedAt).toBeNull();
  });

  it('returns none_indexed when platform filter yields no hosts', async () => {
    generateTextMock.mockResolvedValue({
      text: 'No profile.',
      toolResults: [
        {
          output: {
            results: [{ url: 'https://example.com/page', title: 'Other', snippet: 'x' }],
          },
        },
      ],
    });

    const result = await executeAccountResearchSourceSearch({
      sourceType: 'tiktok',
      ctx: { businessName: 'Trail Outfitters' },
    });

    expect(result.status).toBe('none_indexed');
    expect(result.citations).toHaveLength(0);
  });
});
