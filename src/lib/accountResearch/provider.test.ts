import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAccountResearchContext } from '@/lib/accountResearch/context';
import { readSearchCandidates } from '@/lib/accountResearch/candidates';
import { prospectFixture } from '@/lib/prospectFixture';

const generateTextMock = vi.fn();
const exaSearchMock = vi.fn(() => ({ type: 'mock-tool' }));

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  stepCountIs: (n: number) => ({ type: 'stepCount', n }),
  createGateway: () => ({
    tools: {
      exaSearch: (opts?: Record<string, unknown>) =>
        (exaSearchMock as (o?: unknown) => unknown)(opts),
    },
  }),
  gateway: {
    tools: {
      exaSearch: (opts?: Record<string, unknown>) =>
        (exaSearchMock as (o?: unknown) => unknown)(opts),
    },
  },
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

import { executeAccountResearchSourceSearch } from '@/lib/accountResearch/provider';

const baseCtx = buildAccountResearchContext({
  prospect: prospectFixture({
    id: 1,
    name: 'Trail Outfitters',
    city: 'Bend',
    website: 'https://trailoutfitters.com',
  }),
});

describe('executeAccountResearchSourceSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores website HTML social links as candidates without auto-locking', async () => {
    generateTextMock.mockResolvedValue({
      text: 'Hits.',
      toolResults: [
        {
          output: {
            results: [
              {
                url: 'https://www.instagram.com/othergolf/',
                title: 'Other',
                snippet: 'Unrelated',
              },
            ],
          },
        },
      ],
    });

    const result = await executeAccountResearchSourceSearch({
      sourceType: 'instagram',
      ctx: baseCtx,
      websiteSocialLinks: {
        instagram: {
          url: 'https://instagram.com/trailoutfitters',
          handle: 'trailoutfitters',
          source: 'html_anchor',
        },
      },
    });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(result.resolvedPublicUrl).toBeNull();
    expect(result.citations).toHaveLength(0);
    const candidates = readSearchCandidates(result.providerMetadata);
    expect(candidates[0]?.url).toContain('instagram.com/trailoutfitters');
    expect(candidates.some((c) => c.url.includes('instagram.com/othergolf'))).toBe(true);
  });

  it('stores Instagram discovery candidates without resolving a profile', async () => {
    generateTextMock.mockResolvedValue({
      text: 'Mixed results.',
      toolResults: [
        {
          output: {
            results: [
              {
                url: 'https://www.instagram.com/trailoutfitters/',
                title: 'Trail Outfitters',
                snippet: 'Bend OR',
              },
              {
                url: 'https://www.instagram.com/p/ABC123/',
                title: 'Post',
                snippet: 'sale',
              },
            ],
          },
        },
      ],
    });

    const result = await executeAccountResearchSourceSearch({
      sourceType: 'instagram',
      ctx: baseCtx,
    });

    expect(result.resolvedPublicUrl).toBeNull();
    expect(result.citations).toHaveLength(0);
    const candidates = readSearchCandidates(result.providerMetadata);
    expect(candidates.some((c) => /instagram\.com\/trailoutfitters/i.test(c.url))).toBe(true);
  });

  it('does not domain-filter website discovery even when official hostname is known', async () => {
    generateTextMock.mockResolvedValue({
      text: 'Official site.',
      toolResults: [
        {
          output: {
            results: [
              {
                url: 'https://trailoutfitters.com/about',
                title: 'About',
                text: 'Outdoor retailer in Bend',
              },
            ],
          },
        },
      ],
    });

    const result = await executeAccountResearchSourceSearch({
      sourceType: 'website',
      ctx: { ...baseCtx, officialHostname: 'trailoutfitters.com' },
    });

    // The gw.tools.exaSearch() config has no `query` field — the model always
    // authors the search string itself, so the pinned query can only reach it
    // via the prompt text, never via the tool config.
    expect(exaSearchMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ query: expect.anything() }),
    );
    expect(exaSearchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeDomains: expect.arrayContaining(['yellowpages.ca', 'integolf.com']),
        numResults: 10,
      }),
    );
    expect(exaSearchMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ category: expect.anything() }),
    );
    expect(exaSearchMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ userLocation: expect.anything() }),
    );
    expect(generateTextMock.mock.calls[0]?.[0]?.toolChoice).toBe('required');
    expect(generateTextMock.mock.calls[0]?.[0]?.prompt).toContain(
      '"Trail Outfitters" official website',
    );
    expect(generateTextMock.mock.calls[0]?.[0]?.prompt).toContain(
      'Reject similarly named competitors',
    );
    expect(result.status).toBe('succeeded');
    expect(result.resolvedPublicUrl).toBeNull();
    expect(result.citations).toHaveLength(0);
    expect(readSearchCandidates(result.providerMetadata)).toHaveLength(1);
  });

  it('captures the query the model actually sent to exa_search for observability', async () => {
    generateTextMock.mockResolvedValue({
      text: 'Official site.',
      toolCalls: [
        {
          toolName: 'exa_search',
          input: { query: 'Trail Outfitters shop Bend Oregon' },
        },
      ],
      toolResults: [
        {
          output: {
            results: [{ url: 'https://trailoutfitters.com/about', title: 'About' }],
          },
        },
      ],
    });

    const result = await executeAccountResearchSourceSearch({
      sourceType: 'website',
      ctx: { ...baseCtx, officialHostname: 'trailoutfitters.com' },
    });

    expect(result.providerMetadata.model_query).toBe('Trail Outfitters shop Bend Oregon');
  });

  it('drops Yellow Pages website candidates and does not auto-resolve', async () => {
    generateTextMock.mockResolvedValue({
      text: 'Official site.',
      toolResults: [
        {
          output: {
            results: [
              {
                url: 'https://www.yellowpages.ca/bus/listing',
                title: 'YP',
                snippet: 'listing',
              },
              {
                url: 'https://www.buckerfields.ca/',
                title: "Buckerfield's Kelowna",
                snippet: 'Kelowna, BC country store',
              },
            ],
          },
        },
      ],
    });

    const result = await executeAccountResearchSourceSearch({
      sourceType: 'website',
      ctx: {
        ...baseCtx,
        businessName: "Buckerfield's Kelowna",
        city: 'Kelowna',
        officialHostname: 'yellowpages.ca',
        website: 'https://www.yellowpages.ca/bus/listing',
      },
    });

    expect(exaSearchMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ query: expect.anything() }),
    );
    expect(exaSearchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeDomains: expect.arrayContaining(['yellowpages.ca']),
      }),
    );
    expect(generateTextMock.mock.calls[0]?.[0]?.prompt).toContain(
      `"Buckerfield's Kelowna" official website`,
    );
    expect(result.status).toBe('succeeded');
    expect(result.queryText).toContain(`"Buckerfield's Kelowna" official website`);
    expect(result.queryText).toContain('Kelowna');
    expect(result.resolvedPublicUrl).toBeNull();
    expect(result.citations).toHaveLength(0);
    const candidates = readSearchCandidates(result.providerMetadata);
    expect(candidates.every((c) => !c.url.includes('yellowpages'))).toBe(true);
    expect(candidates.some((c) => c.url.includes('buckerfields.ca'))).toBe(true);
  });

  it('re-fetches only the locked website host and does not rewrite the URL', async () => {
    generateTextMock.mockResolvedValue({
      text: 'About page.',
      toolResults: [
        {
          output: {
            results: [
              {
                url: 'https://www.yellowpages.ca/bus/listing',
                title: 'YP',
                snippet: 'listing',
              },
              {
                url: 'https://www.buckerfields.ca/Locations',
                title: 'Locations',
                snippet: 'Kelowna',
              },
            ],
          },
        },
      ],
    });

    const locked = 'https://www.buckerfields.ca/';
    const result = await executeAccountResearchSourceSearch({
      sourceType: 'website',
      ctx: {
        ...baseCtx,
        businessName: "Buckerfield's Kelowna",
      },
      lockedUrl: locked,
    });

    expect(exaSearchMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ query: expect.anything() }),
    );
    expect(exaSearchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        includeDomains: ['buckerfields.ca'],
      }),
    );
    expect(generateTextMock.mock.calls[0]?.[0]?.prompt).toContain(
      `"Buckerfield's Kelowna" official website`,
    );
    expect(result.resolvedPublicUrl).toContain('buckerfields.ca');
    expect(result.resolvedPublicUrl).not.toContain('yellowpages');
    expect(result.citations.every((c) => c.url.includes('buckerfields.ca'))).toBe(true);
  });
});
