import { generateObject } from 'ai';
import { z } from 'zod';
import type { AgentSupabase } from '@/lib/agentAuth';
import { researchCompany } from '@/lib/companyWebResearch';
import { CATEGORY_MAPPING_GUIDANCE } from '@/lib/enrichGuidance';
import {
  mapProspectRow,
  PROSPECT_SELECT,
  type Prospect,
  type ProspectCategory,
  type ProspectRegion,
} from '@/lib/prospects';
import type { ProspectRow } from '@/types/database';

export const PROSPECT_CATEGORIES = [
  'Golf',
  'Marina',
  'Hardware',
  'Resort Gift',
] as const satisfies readonly ProspectCategory[];

export const PROSPECT_REGIONS = [
  'Okanagan',
  'Shuswap',
  'Vancouver Island',
  'Sea-to-Sky',
  'Kootenays',
  'Fraser Valley',
] as const satisfies readonly ProspectRegion[];

export const enrichedProspectSchema = z.object({
  name: z.string().min(1).describe('Cleaned business / store name'),
  category: z
    .enum(PROSPECT_CATEGORIES)
    .describe(
      'CRM channel from actual merchandise: hunting/fishing/shooting specialty → Hardware; golf → Golf; marine → Marina; resort gift → Resort Gift. Never map hunting/fishing to Golf.',
    ),
  region: z.enum(PROSPECT_REGIONS),
  city: z.string().min(1).describe('BC city or town'),
  fitScore: z.number().int().min(1).max(10),
  notes: z.string().min(1).describe('Two short sentences on store positioning and customer vibe'),
  address: z
    .string()
    .nullable()
    .describe(
      'Street address only if explicitly present in the research brief or official website; otherwise null. Do not guess.',
    ),
  phone: z
    .string()
    .nullable()
    .describe(
      'Store phone only if explicitly present in the research brief or official website; otherwise null. Do not guess.',
    ),
});

export type EnrichedProspectFields = z.infer<typeof enrichedProspectSchema>;

export type CreateEnrichedProspectInput = {
  companyName: string;
  websiteUrl?: string;
  contactName?: string;
  /** When provided (e.g. by contact enrich), skip a second web search. */
  researchBrief?: string | null;
};

export type CreateEnrichedProspectResult =
  { ok: true; prospect: Prospect; researchBrief: string | null } | { ok: false; error: string };

export type InferEnrichedProspectFieldsResult =
  | { ok: true; fields: EnrichedProspectFields; researchBrief: string | null }
  | { ok: false; error: string };

/** Encode fit score + positioning notes into the prospects.fit column. */
export function formatProspectFit(fitScore: number, notes: string): string {
  const score = Math.min(10, Math.max(1, Math.round(fitScore)));
  const cleaned = notes.trim().replace(/\s+/g, ' ');
  return `${score}/10 — ${cleaned}`;
}

/** Next integer prospect id given current max (or null when table empty). */
export function nextProspectId(maxId: number | null | undefined): number {
  if (maxId == null || !Number.isFinite(maxId)) return 1;
  return Math.floor(maxId) + 1;
}

/** Map inferred fields onto an existing prospect for preview (no DB write). */
export function proposedProspectFromFields(
  current: Prospect,
  fields: EnrichedProspectFields,
): Prospect {
  return {
    ...current,
    name: fields.name.trim(),
    category: fields.category,
    region: fields.region,
    city: fields.city.trim(),
    address: fields.address?.trim() || '',
    phone: fields.phone?.trim() || '',
    fit: formatProspectFit(fields.fitScore, fields.notes),
  };
}

function isUniqueViolation(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('duplicate') || m.includes('unique') || m.includes('23505');
}

async function allocateNextId(supabase: AgentSupabase): Promise<number | { error: string }> {
  const { data, error } = await supabase
    .from('prospects')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { error: error.message };
  return nextProspectId(data?.id);
}

async function insertProspect(
  supabase: AgentSupabase,
  id: number,
  fields: EnrichedProspectFields,
): Promise<CreateEnrichedProspectResult> {
  const fit = formatProspectFit(fields.fitScore, fields.notes);
  const { data, error } = await supabase
    .from('prospects')
    .insert({
      id,
      name: fields.name.trim(),
      category: fields.category,
      region: fields.region,
      city: fields.city.trim(),
      address: fields.address?.trim() || '',
      phone: fields.phone?.trim() || '',
      fit,
    })
    .select(PROSPECT_SELECT)
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: 'Insert returned no row' };
  }
  return { ok: true, prospect: mapProspectRow(data as ProspectRow), researchBrief: null };
}

/**
 * Research + structured CRM fields without writing to the database.
 */
export async function inferEnrichedProspectFields(
  input: CreateEnrichedProspectInput,
): Promise<InferEnrichedProspectFieldsResult> {
  const companyName = input.companyName.trim();
  if (!companyName) {
    return { ok: false, error: 'Company name is required' };
  }

  const websiteUrl = input.websiteUrl?.trim() || undefined;
  const contactName = input.contactName?.trim() || undefined;
  const websiteHint = websiteUrl
    ? `Official website (authoritative; prefer facts from this site over name heuristics): ${websiteUrl}`
    : 'No website URL provided.';

  let researchBrief: string | null =
    typeof input.researchBrief === 'string' && input.researchBrief.trim()
      ? input.researchBrief.trim()
      : null;

  if (researchBrief == null && input.researchBrief === undefined) {
    const research = await researchCompany({ companyName, websiteUrl, contactName });
    researchBrief = research.brief;
  }

  const researchBlock = researchBrief
    ? [
        'Web research brief (ground truth when present; do not invent beyond it):',
        researchBrief,
        'Use address/phone only if the brief explicitly includes them; otherwise set those fields to null.',
        'If the brief describes hunting, fishing, firearms, or shooting specialty, category MUST be Hardware — not Golf.',
      ].join('\n')
    : 'No web research brief available; infer carefully from the company name and website hint only. Set address and phone to null. Do not assume Golf from "Sports" in the name.';

  try {
    const result = await generateObject({
      model: 'openai/gpt-4o',
      schema: enrichedProspectSchema,
      schemaName: 'EnrichedProspect',
      prompt: [
        'You help a BC wholesale apparel sales rep (Old Guys Rule) onboard a new retailer prospect.',
        'Infer structured CRM fields from the company name, optional official website, and web research brief.',
        CATEGORY_MAPPING_GUIDANCE,
        'Region must be exactly one of: Okanagan, Shuswap, Vancouver Island, Sea-to-Sky, Kootenays, Fraser Valley.',
        'City must match the researched store location when known.',
        'fitScore is 1–10 for likely fit with casual lifestyle apparel wholesale (outdoor specialty that sells apparel can score mid–high).',
        'notes must be exactly two short sentences on positioning / customer vibe based on real merchandise.',
        'Clean up the business name; do not invent phone numbers or street addresses.',
        `Company name: ${companyName}`,
        websiteHint,
        researchBlock,
      ].join('\n'),
    });
    return { ok: true, fields: result.object, researchBrief };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Enrichment failed';
    return { ok: false, error: message };
  }
}

/**
 * Infer CRM fields for a BC retailer via AI Gateway (+ optional web research), then INSERT under JWT/RLS.
 * Address/phone only when research cites them. Encodes fit score + notes into `fit`.
 */
export async function createEnrichedProspect(
  supabase: AgentSupabase,
  input: CreateEnrichedProspectInput,
): Promise<CreateEnrichedProspectResult> {
  const inferred = await inferEnrichedProspectFields(input);
  if (!inferred.ok) {
    return inferred;
  }

  const { fields, researchBrief } = inferred;

  const firstId = await allocateNextId(supabase);
  if (typeof firstId === 'object') {
    return { ok: false, error: firstId.error };
  }

  const first = await insertProspect(supabase, firstId, fields);
  if (first.ok) {
    return { ok: true, prospect: first.prospect, researchBrief };
  }
  if (!isUniqueViolation(first.error)) {
    return first;
  }

  const retryId = await allocateNextId(supabase);
  if (typeof retryId === 'object') {
    return { ok: false, error: retryId.error };
  }
  const retry = await insertProspect(supabase, retryId, fields);
  if (retry.ok) {
    return { ok: true, prospect: retry.prospect, researchBrief };
  }
  return retry;
}
