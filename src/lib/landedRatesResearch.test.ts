import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateTextMock = vi.fn();
const generateObjectMock = vi.fn();
const perplexitySearchMock = vi.fn(() => ({ type: 'mock-tool' }));

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  generateObject: (...args: unknown[]) => generateObjectMock(...args),
  stepCountIs: (n: number) => ({ type: 'stepCount', n }),
  gateway: {
    tools: {
      perplexitySearch: (opts?: { maxResults?: number }) =>
        (perplexitySearchMock as (o?: unknown) => unknown)(opts),
    },
  },
}));

import { researchUsdCadLandedFactors } from '@/lib/landedRatesResearch';

describe('researchUsdCadLandedFactors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns fx, brief, and asOf on success', async () => {
    generateTextMock.mockResolvedValue({
      text: 'USD/CAD mid-market 1.38. Federal GST remains 5%. Freight not published.',
    });
    generateObjectMock.mockResolvedValue({
      object: {
        fx: 1.38,
        freightRate: null,
        gstRate: 0.05,
        otherTaxRate: null,
        brief: 'BoC-style USD/CAD 1.38; GST 5%.',
        asOf: '2026-08-03T12:00:00.000Z',
      },
    });

    const result = await researchUsdCadLandedFactors();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rates.fx).toBe(1.38);
    expect(result.rates.gstRate).toBe(0.05);
    expect(result.rates.freightRate).toBeUndefined();
    expect(result.rates.brief).toContain('1.38');
    expect(result.rates.asOf).toBe('2026-08-03T12:00:00.000Z');
    expect(perplexitySearchMock).toHaveBeenCalledWith({ maxResults: 5 });
    expect(generateObjectMock).toHaveBeenCalled();
  });

  it('fills asOf when the model omits it', async () => {
    generateTextMock.mockResolvedValue({ text: 'USD/CAD 1.40 today.' });
    generateObjectMock.mockResolvedValue({
      object: {
        fx: 1.4,
        freightRate: null,
        gstRate: null,
        otherTaxRate: null,
        brief: 'USD/CAD 1.40.',
        asOf: null,
      },
    });

    const before = Date.now();
    const result = await researchUsdCadLandedFactors();
    const after = Date.now();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const asOfMs = Date.parse(result.rates.asOf);
    expect(asOfMs).toBeGreaterThanOrEqual(before - 1000);
    expect(asOfMs).toBeLessThanOrEqual(after + 1000);
  });

  it('fails when web research returns empty brief', async () => {
    generateTextMock.mockResolvedValue({ text: '   ' });
    const result = await researchUsdCadLandedFactors();
    expect(result).toEqual({ ok: false, error: 'Web research returned empty brief' });
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it('fails when generateObject throws', async () => {
    generateTextMock.mockResolvedValue({ text: 'USD/CAD 1.37' });
    generateObjectMock.mockRejectedValue(new Error('schema fail'));
    const result = await researchUsdCadLandedFactors();
    expect(result).toEqual({ ok: false, error: 'schema fail' });
  });
});
