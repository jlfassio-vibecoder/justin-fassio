import { generateObject } from 'ai';
import { z } from 'zod';
import type { AgentSupabase } from '@/lib/agentAuth';
import {
  mapProspectRow,
  type Prospect,
  type ProspectCategory,
  type ProspectRegion,
} from '@/lib/prospects';

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

const enrichedProspectSchema = z.object({
  name: z.string().min(1).describe('Cleaned business / store name'),
  category: z.enum(PROSPECT_CATEGORIES),
  region: z.enum(PROSPECT_REGIONS),
  city: z.string().min(1).describe('BC city or town'),
  fitScore: z.number().int().min(1).max(10),
  notes: z.string().min(1).describe('Two short sentences on store positioning and customer vibe'),
});

export type EnrichedProspectFields = z.infer<typeof enrichedProspectSchema>;

export type CreateEnrichedProspectInput = {
  companyName: string;
  websiteUrl?: string;
};

export type CreateEnrichedProspectResult =
  { ok: true; prospect: Prospect } | { ok: false; error: string };

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
      address: '',
      phone: '',
      fit,
    })
    .select(
      'id, name, category, region, city, address, phone, fit, account_status, converted_at, initial_order_date, notes, created_at, updated_at',
    )
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: 'Insert returned no row' };
  }
  return { ok: true, prospect: mapProspectRow(data) };
}

/**
 * Infer CRM fields for a BC retailer via AI Gateway, then INSERT under the caller's JWT + RLS.
 * Does not invent address/phone. Encodes fit score + notes into `fit`.
 */
export async function createEnrichedProspect(
  supabase: AgentSupabase,
  input: CreateEnrichedProspectInput,
): Promise<CreateEnrichedProspectResult> {
  const companyName = input.companyName.trim();
  if (!companyName) {
    return { ok: false, error: 'Company name is required' };
  }

  const websiteUrl = input.websiteUrl?.trim() || undefined;
  const websiteHint = websiteUrl
    ? `Website URL hint (may be outdated; do not invent contact details from it): ${websiteUrl}`
    : 'No website URL provided.';

  let fields: EnrichedProspectFields;
  try {
    const result = await generateObject({
      model: 'openai/gpt-4o',
      schema: enrichedProspectSchema,
      schemaName: 'EnrichedProspect',
      prompt: [
        'You help a BC wholesale apparel sales rep (Old Guys Rule) onboard a new retailer prospect.',
        'Infer structured CRM fields from the company name (and optional website hint).',
        'Category must be exactly one of: Golf, Marina, Hardware, Resort Gift.',
        'Region must be exactly one of: Okanagan, Shuswap, Vancouver Island, Sea-to-Sky, Kootenays, Fraser Valley.',
        'City must be a plausible BC city/town for that region.',
        'fitScore is 1–10 for likely fit with casual lifestyle apparel wholesale.',
        'notes must be exactly two short sentences on positioning / customer vibe.',
        'Clean up the business name; do not invent phone numbers or street addresses.',
        `Company name: ${companyName}`,
        websiteHint,
      ].join('\n'),
    });
    fields = result.object;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Enrichment failed';
    return { ok: false, error: message };
  }

  const firstId = await allocateNextId(supabase);
  if (typeof firstId === 'object') {
    return { ok: false, error: firstId.error };
  }

  const first = await insertProspect(supabase, firstId, fields);
  if (first.ok || !isUniqueViolation(first.error)) {
    return first;
  }

  const retryId = await allocateNextId(supabase);
  if (typeof retryId === 'object') {
    return { ok: false, error: retryId.error };
  }
  return insertProspect(supabase, retryId, fields);
}
