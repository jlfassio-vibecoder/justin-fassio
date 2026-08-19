import { generateObject, generateText, gateway, stepCountIs } from 'ai';
import { z } from 'zod';
import { US_OGR_FILL_BLANK_PERSONA } from '@/lib/accountImport/enrich';
import { LOOKALIKE_MAX_CANDIDATES } from '@/lib/lookalike/classification';
import type { ProposedLookalike } from '@/lib/lookalike/match';
import { territoryCodeFromImportState } from '@/lib/accountImport/territory';
import { normalizeProspectName } from '@/lib/prospectListImport';

export const LOOKALIKE_SEARCH_PROVIDER = 'openai/gpt-4o';

export const lookalikeCandidateSchema = z.object({
  candidates: z
    .array(
      z.object({
        name: z.string().min(1).describe('Independent retailer business name'),
        city: z.string().min(1).describe('Oregon or Washington city'),
        state: z.string().min(1).describe('OR, WA, Oregon, or Washington'),
        website: z
          .string()
          .nullable()
          .describe('Official website if published; otherwise null. Do not invent.'),
        whySimilar: z
          .string()
          .min(1)
          .describe('One sentence on store type, location, or merchandise similarity'),
      }),
    )
    .max(LOOKALIKE_MAX_CANDIDATES),
});

export function filterLookalikeSearchHits(input: {
  hits: ProposedLookalike[];
  seedNames: readonly string[];
}): ProposedLookalike[] {
  const excluded = new Set(
    input.seedNames.map((name) => normalizeProspectName(name)).filter(Boolean),
  );
  const seen = new Set<string>();
  const out: ProposedLookalike[] = [];
  for (const hit of input.hits) {
    const name = hit.name.trim();
    const city = hit.city.trim();
    const stateCode = territoryCodeFromImportState(hit.state);
    if (!name || !city || !stateCode) continue;
    const key = normalizeProspectName(name);
    if (!key || excluded.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      city,
      state: stateCode,
      website: hit.website?.trim() || null,
      whySimilar: hit.whySimilar.trim(),
    });
    if (out.length >= LOOKALIKE_MAX_CANDIDATES) break;
  }
  return out;
}

export async function searchLookalikeCandidates(input: {
  traitBrief: string;
  seedNames: readonly string[];
}): Promise<{ ok: true; candidates: ProposedLookalike[] } | { ok: false; error: string }> {
  try {
    const brief = await generateText({
      model: LOOKALIKE_SEARCH_PROVIDER,
      stopWhen: stepCountIs(4),
      tools: {
        perplexity_search: gateway.tools.perplexitySearch({ maxResults: 5 }),
      },
      prompt: [
        US_OGR_FILL_BLANK_PERSONA,
        'Find up to 8 net-new independent specialty retailers in Oregon or Washington similar to these seed stores.',
        'Exclude the seed names. Do not invent emails, phones, buyers, or BC geography.',
        'Do not assume the discoveries have purchased OGR or any apparel line.',
        'Prefer independent shops over chains. Name city and state for each.',
        input.traitBrief,
        `Seed names to exclude: ${input.seedNames.join(', ')}`,
      ].join('\n'),
    });
    const text = brief.text.trim();
    if (!text) return { ok: false, error: 'Lookalike search returned an empty brief' };
    const parsed = await generateObject({
      model: LOOKALIKE_SEARCH_PROVIDER,
      schema: lookalikeCandidateSchema,
      prompt: [
        'Extract up to 8 Oregon/Washington retailer candidates from this research brief.',
        'Omit seed names and any business outside Oregon or Washington.',
        'Do not invent websites.',
        text,
      ].join('\n'),
    });
    return {
      ok: true,
      candidates: filterLookalikeSearchHits({
        hits: parsed.object.candidates,
        seedNames: input.seedNames,
      }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lookalike search failed';
    return { ok: false, error: message };
  }
}
