import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateTextMock = vi.fn();
const perplexitySearchMock = vi.fn(() => ({ type: 'mock-tool' }));

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  stepCountIs: (n: number) => ({ type: 'stepCount', n }),
  gateway: {
    tools: {
      perplexitySearch: (opts?: { maxResults?: number; searchDomainFilter?: string[] }) =>
        (perplexitySearchMock as (o?: unknown) => unknown)(opts),
    },
  },
}));

import { researchCompany } from '@/lib/companyWebResearch';

describe('researchCompany', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null brief for blank company name without calling AI', async () => {
    const result = await researchCompany({ companyName: '  ' });
    expect(result).toEqual({ brief: null, error: 'Company name is required' });
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('returns trimmed brief from generateText', async () => {
    generateTextMock.mockResolvedValue({
      text: '  Kelowna Golf is a semi-private course in Kelowna, BC.  ',
    });

    const result = await researchCompany({
      companyName: 'Kelowna Golf',
      websiteUrl: 'https://www.example-golf.ca',
      contactName: 'Sarah Jenkins',
    });

    expect(result.error).toBeNull();
    expect(result.brief).toBe('Kelowna Golf is a semi-private course in Kelowna, BC.');
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai/gpt-4o',
        prompt: expect.stringContaining('Authoritative website'),
        tools: expect.objectContaining({
          perplexity_search: expect.anything(),
        }),
      }),
    );
    expect(perplexitySearchMock).toHaveBeenCalledWith({
      maxResults: 5,
      searchDomainFilter: ['example-golf.ca'],
    });
  });

  it('does not domain-filter when no website url', async () => {
    generateTextMock.mockResolvedValue({ text: 'Brief' });
    await researchCompany({ companyName: 'A & C Sports Ltd' });
    expect(perplexitySearchMock).toHaveBeenCalledWith({ maxResults: 5 });
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Never map hunting'),
      }),
    );
  });

  it('soft-fails when generateText throws', async () => {
    generateTextMock.mockRejectedValue(new Error('gateway down'));
    const result = await researchCompany({ companyName: 'Kelowna Golf' });
    expect(result).toEqual({ brief: null, error: 'gateway down' });
  });

  it('skips domain filter on shared directory hosts when fillBlanksFocus', async () => {
    generateTextMock.mockResolvedValue({ text: 'Brief with address' });
    await researchCompany({
      companyName: 'Some Club',
      websiteUrl: 'https://www.britishcolumbiagolf.org/course/123',
      city: 'Kelowna',
      fillBlanksFocus: true,
    });
    expect(perplexitySearchMock).toHaveBeenCalledWith({ maxResults: 5 });
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringMatching(/directory\/shared URL|Fill-blank focus/i),
      }),
    );
  });
});
