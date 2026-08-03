import { generateObject, generateText, gateway, stepCountIs } from 'ai';
import { z } from 'zod';
import type { LandedRatesPayload } from '@/lib/landedRatesClient';

const BRIEF_MAX_CHARS = 4000;

const landedRatesSchema = z.object({
  fx: z.number().min(1).max(2.5).describe('Current USD to CAD exchange rate (CAD per 1 USD)'),
  freightRate: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe(
      'Freight adder as a fraction of goods cost (e.g. 0.10 = 10%). Null if not confidently known.',
    ),
  gstRate: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe('Federal GST as a fraction (0.05 = 5%). Null if not confirmed.'),
  otherTaxRate: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe(
      'Combined other tax (e.g. BC PST) as a fraction. Null if not confidently known — do not invent.',
    ),
  brief: z.string().min(1).describe('Short factual summary of sources and figures used'),
  asOf: z
    .string()
    .nullable()
    .describe('ISO timestamp for when the FX figure was quoted, if known; otherwise null'),
});

export type ResearchUsdCadLandedFactorsResult =
  { ok: true; rates: LandedRatesPayload } | { ok: false; error: string };

function clampRate(value: number | null | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}

function normalizePayload(
  object: z.infer<typeof landedRatesSchema>,
  researchBrief: string,
): LandedRatesPayload {
  const fx = Math.min(2.5, Math.max(1, object.fx));
  const rates: LandedRatesPayload = {
    fx,
    brief: (object.brief.trim() || researchBrief).slice(0, BRIEF_MAX_CHARS),
    asOf:
      typeof object.asOf === 'string' && object.asOf.trim()
        ? object.asOf.trim()
        : new Date().toISOString(),
  };

  const freightRate = clampRate(object.freightRate);
  if (freightRate != null) rates.freightRate = freightRate;

  const gstRate = clampRate(object.gstRate);
  if (gstRate != null) rates.gstRate = gstRate;

  const otherTaxRate = clampRate(object.otherTaxRate);
  if (otherTaxRate != null) rates.otherTaxRate = otherTaxRate;

  return rates;
}

/**
 * Research current USD→CAD and optional landed-cost tax/freight factors via AI Gateway + Perplexity.
 */
export async function researchUsdCadLandedFactors(): Promise<ResearchUsdCadLandedFactorsResult> {
  let researchBrief: string;
  try {
    const search = await generateText({
      model: 'openai/gpt-4o',
      stopWhen: stepCountIs(4),
      tools: {
        perplexity_search: gateway.tools.perplexitySearch({
          maxResults: 5,
        }),
      },
      prompt: [
        'You research pricing inputs for a BC wholesale apparel sales rep importing Old Guys Rule goods from Vista, CA (UPS) into Canada.',
        'Use the web search tool to find CURRENT public figures.',
        'Priority: mid-market or Bank of Canada–style USD to CAD exchange rate (CAD per 1 USD).',
        'Also confirm Canada federal GST is 5% when sources agree.',
        'If reliable public sources state a typical freight / landed adder for US→Canada apparel wholesale, note it as a percent of goods; otherwise say freight is unknown.',
        'Do not invent PST/HST rates for a specific province unless clearly citing a current public figure; BC PST is often relevant but omit if unsure.',
        'Write a concise factual brief (no markdown tables) with the FX number and what you found on GST/freight/other tax.',
      ].join('\n'),
    });
    researchBrief = search.text.trim().slice(0, BRIEF_MAX_CHARS);
    if (!researchBrief) {
      return { ok: false, error: 'Web research returned empty brief' };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Web research failed';
    return { ok: false, error: message };
  }

  try {
    const result = await generateObject({
      model: 'openai/gpt-4o',
      schema: landedRatesSchema,
      schemaName: 'LandedRates',
      prompt: [
        'Extract structured CAD landed-cost factors for a BC apparel wholesale rep.',
        'fx is required: CAD per 1 USD from the research brief (typical range ~1.2–1.5).',
        'gstRate should be 0.05 when the brief confirms federal GST 5%; otherwise null.',
        'freightRate and otherTaxRate only when the brief gives a credible figure; otherwise null — never invent.',
        'brief: one or two short sentences summarizing sources/figures.',
        'asOf: ISO timestamp if the brief quotes a dated rate; otherwise null.',
        'Web research brief:',
        researchBrief,
      ].join('\n'),
    });
    return { ok: true, rates: normalizePayload(result.object, researchBrief) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Landed rates structuring failed';
    return { ok: false, error: message };
  }
}
