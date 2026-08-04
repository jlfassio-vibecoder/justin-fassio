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

import { collectResearchContext, researchUsdCadLandedFactors } from '@/lib/landedRatesResearch';

describe('collectResearchContext', () => {
  it('prefers direct text when present', () => {
    expect(
      collectResearchContext({
        text: '  USD/CAD 1.38  ',
        toolResults: [{ output: { ignored: true } }],
      }),
    ).toBe('USD/CAD 1.38');
  });

  it('recovers tool output when text is empty', () => {
    const ctx = collectResearchContext({
      text: '',
      toolResults: [{ output: { results: [{ title: 'BoC', snippet: 'USD/CAD 1.39' }] } }],
    });
    expect(ctx).toContain('1.39');
  });

  it('reads legacy result field and step text', () => {
    const ctx = collectResearchContext({
      text: ' ',
      steps: [
        {
          text: '',
          toolResults: [{ result: 'Bank of Canada USD/CAD 1.41' }],
        },
        { text: 'Confirm GST 5%.' },
      ],
    });
    expect(ctx).toContain('1.41');
    expect(ctx).toContain('GST 5%');
  });
});

describe('researchUsdCadLandedFactors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns fx, brief, and asOf on success', async () => {
    generateTextMock.mockResolvedValue({
      text: 'USD/CAD mid-market 1.38. Federal GST remains 5%. Freight not published.',
      toolResults: [],
      steps: [],
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

  it('synthesizes a brief when search returns empty text but tool output', async () => {
    generateTextMock
      .mockResolvedValueOnce({
        text: '',
        toolResults: [{ output: { results: [{ snippet: 'USD to CAD 1.37 Bank of Canada' }] } }],
        steps: [],
      })
      .mockResolvedValueOnce({
        text: 'Published USD/CAD is 1.37 (Bank of Canada). GST 5%.',
      });
    generateObjectMock.mockResolvedValue({
      object: {
        fx: 1.37,
        freightRate: null,
        gstRate: 0.05,
        otherTaxRate: null,
        brief: 'BoC USD/CAD 1.37; GST 5%.',
        asOf: null,
      },
    });

    const result = await researchUsdCadLandedFactors();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rates.fx).toBe(1.37);
    expect(generateTextMock).toHaveBeenCalledTimes(2);
    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Published USD/CAD is 1.37'),
      }),
    );
  });

  it('fills asOf when the model omits it', async () => {
    generateTextMock.mockResolvedValue({ text: 'USD/CAD 1.40 today.', toolResults: [], steps: [] });
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

  it('fails clearly when search yields no text and no tool output', async () => {
    generateTextMock.mockResolvedValue({ text: '   ', toolResults: [], steps: [] });
    const result = await researchUsdCadLandedFactors();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/published USD\/CAD/i);
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it('fails when generateObject throws', async () => {
    generateTextMock.mockResolvedValue({ text: 'USD/CAD 1.37', toolResults: [], steps: [] });
    generateObjectMock.mockRejectedValue(new Error('schema fail'));
    const result = await researchUsdCadLandedFactors();
    expect(result).toEqual({ ok: false, error: 'schema fail' });
  });
});
