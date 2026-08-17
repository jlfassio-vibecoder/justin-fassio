import { generateObject } from 'ai';
import { z } from 'zod';
import type { AgentSupabase } from '@/lib/agentAuth';
import { researchCompany } from '@/lib/companyWebResearch';
import { CATEGORY_MAPPING_GUIDANCE } from '@/lib/enrichGuidance';
import {
  mapProspectRow,
  PROSPECT_SELECT,
  type Prospect,
  type ProspectListRow,
  type ProspectRegion,
} from '@/lib/prospects';
import { PRIMARY_RETAIL_CHANNELS, type PrimaryRetailChannel } from '@/lib/crmRetailTaxonomy';
import { BC_TERRITORY_CODE, resolveTerritoryIdByCode } from '@/lib/territories';

export const PROSPECT_CATEGORIES = PRIMARY_RETAIL_CHANNELS.map((o) => o.value) as [
  PrimaryRetailChannel,
  ...PrimaryRetailChannel[],
];

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
      'Primary retail channel code from actual merchandise (see CATEGORY_MAPPING_GUIDANCE). Never map hunting/fishing specialty to golf_retail.',
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
  /** Known inbound phone — preferred over AI guess when present. */
  phone?: string;
  /** Known inbound email — stored on buyer contact when present. */
  email?: string;
  /** Known inbound city — preferred over AI guess when present. */
  city?: string;
  /** Buyer retail channel hint for research + category mapping. */
  retailChannelHint?: string;
  /** Territory code (bc/ab/ca/or/wa). Defaults to British Columbia unless a non-OGR line is set. */
  territoryCode?: string;
  /** When provided (e.g. by contact enrich), skip a second web search. */
  researchBrief?: string | null;
  /**
   * Insert the buyer as the account's primary contact. Callers that create their own
   * primary contact must pass false; only one primary per account is allowed.
   */
  createBuyerContact?: boolean;
  /** Phase 4: bind insert + prompts to this sales line when AI flag is on. */
  salesLineId?: string;
  lineCode?: string;
  aiPersona?: string;
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

async function stampLineAccountIfNeeded(
  supabase: AgentSupabase,
  input: CreateEnrichedProspectInput,
  prospectId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.lineCode === 'bkg') {
    return { ok: true };
  }
  let salesLineId = input.salesLineId?.trim() || '';
  if (!salesLineId) {
    const { data: ogr, error } = await supabase
      .from('lines')
      .select('id')
      .eq('code', 'ogr')
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!ogr) return { ok: false, error: 'OGR sales line not found' };
    salesLineId = ogr.id;
  }
  const { error } = await supabase.from('retailer_line_accounts').insert({
    retailer_id: prospectId,
    sales_line_id: salesLineId,
    relationship_status: 'prospect',
  });
  if (error && !isUniqueViolation(error.message)) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
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

/** Prefer known inbound form facts over AI-inferred phone/city. */
export function applyInboundSeedOverrides(
  fields: EnrichedProspectFields,
  seeds: Pick<CreateEnrichedProspectInput, 'phone' | 'city'>,
): EnrichedProspectFields {
  const phone = seeds.phone?.trim();
  const city = seeds.city?.trim();
  return {
    ...fields,
    phone: phone || fields.phone,
    city: city || fields.city,
  };
}

async function insertProspect(
  supabase: AgentSupabase,
  id: number,
  fields: EnrichedProspectFields,
  extras: { websiteUrl?: string; retailChannelHint?: string; territoryId: string },
): Promise<CreateEnrichedProspectResult> {
  const fit = formatProspectFit(fields.fitScore, fields.notes);
  const website = extras.websiteUrl?.trim() || null;
  const retailCategory = extras.retailChannelHint?.trim() || null;
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
      website,
      source_note: 'Add via AI',
      retail_category: retailCategory,
      territory_id: extras.territoryId,
    })
    .select(PROSPECT_SELECT)
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: 'Insert returned no row' };
  }
  return { ok: true, prospect: mapProspectRow(data as ProspectListRow), researchBrief: null };
}

async function insertBuyerContact(
  supabase: AgentSupabase,
  prospectId: number,
  input: CreateEnrichedProspectInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.createBuyerContact === false) return { ok: true };

  const fullName = input.contactName?.trim();
  if (!fullName) return { ok: true };

  const { data: contact, error } = await supabase
    .from('account_contacts')
    .insert({
      account_id: prospectId,
      role: 'buyer',
      full_name: fullName,
      phone: input.phone?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      is_primary: true,
      notes: 'Inbound / Add via AI',
    })
    .select('id')
    .single();

  if (error || !contact) return { ok: false, error: error?.message ?? 'Failed to create contact' };

  let salesLineId = input.salesLineId?.trim() || '';
  if (!salesLineId && input.lineCode !== 'bkg') {
    const { data: ogr, error: ogrError } = await supabase
      .from('lines')
      .select('id')
      .eq('code', 'ogr')
      .maybeSingle();
    if (ogrError) return { ok: false, error: ogrError.message };
    salesLineId = ogr?.id ?? '';
  }
  if (!salesLineId) return { ok: true };

  const { data: rla, error: rlaError } = await supabase
    .from('retailer_line_accounts')
    .select('id')
    .eq('retailer_id', prospectId)
    .eq('sales_line_id', salesLineId)
    .neq('relationship_status', 'terminated')
    .maybeSingle();
  if (rlaError) return { ok: false, error: rlaError.message };
  if (!rla) return { ok: true };

  const { error: junctionError } = await supabase.from('retailer_line_contacts').upsert(
    {
      retailer_line_account_id: rla.id,
      account_contact_id: contact.id,
      role: 'buyer',
      is_primary: true,
      notes: 'Inbound / Add via AI',
    },
    { onConflict: 'retailer_line_account_id,account_contact_id' },
  );
  if (junctionError) return { ok: false, error: junctionError.message };
  return { ok: true };
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
  const citySeed = input.city?.trim() || undefined;
  const retailChannelHint = input.retailChannelHint?.trim() || undefined;
  const phoneSeed = input.phone?.trim() || undefined;
  const websiteHint = websiteUrl
    ? `Official website (authoritative; prefer facts from this site over name heuristics): ${websiteUrl}`
    : 'No website URL provided.';

  let researchBrief: string | null =
    typeof input.researchBrief === 'string' && input.researchBrief.trim()
      ? input.researchBrief.trim()
      : null;

  if (researchBrief == null && input.researchBrief === undefined) {
    const research = await researchCompany({
      companyName,
      websiteUrl,
      contactName,
      city: citySeed,
      retailCategoryHint: retailChannelHint,
      persona: input.aiPersona,
    });
    researchBrief = research.brief;
  }

  const knownFacts = [
    citySeed ? `Known city from inbound form (prefer this): ${citySeed}` : null,
    phoneSeed ? `Known store/buyer phone from inbound form (prefer this): ${phoneSeed}` : null,
    retailChannelHint
      ? `Inbound retail channel hint (verify against merchandise): ${retailChannelHint}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const researchBlock = researchBrief
    ? [
        'Web research brief (ground truth when present; do not invent beyond it):',
        researchBrief,
        'Use address/phone only if the brief explicitly includes them; otherwise set those fields to null.',
        'If the brief describes hunting, fishing, firearms, or shooting specialty, category MUST be fishing_fly_tackle, outdoor_camping_hunting, or hardware_farm_rural — not golf_retail.',
      ].join('\n')
    : 'No web research brief available; infer carefully from the company name and website hint only. Set address and phone to null. Do not assume golf_retail from "Sports" in the name.';

  try {
    const result = await generateObject({
      model: 'openai/gpt-4o',
      schema: enrichedProspectSchema,
      schemaName: 'EnrichedProspect',
      prompt: [
        input.aiPersona?.trim() ||
          'You help a BC wholesale apparel sales rep (Old Guys Rule) onboard a new retailer prospect.',
        'Infer structured CRM fields from the company name, optional official website, and web research brief.',
        'Prefer known inbound form facts (city/phone/channel) over guesses when they conflict with thin research.',
        CATEGORY_MAPPING_GUIDANCE,
        'Region must be exactly one of: Okanagan, Shuswap, Vancouver Island, Sea-to-Sky, Kootenays, Fraser Valley.',
        'City must match the researched store location when known.',
        'fitScore is 1–10 for likely fit with casual lifestyle apparel wholesale (outdoor specialty that sells apparel can score mid–high).',
        'notes must be exactly two short sentences on positioning / customer vibe based on real merchandise.',
        'Clean up the business name; do not invent phone numbers or street addresses.',
        `Company name: ${companyName}`,
        websiteHint,
        knownFacts || 'No additional inbound form seeds.',
        researchBlock,
      ].join('\n'),
    });
    const fields = applyInboundSeedOverrides(result.object, {
      phone: phoneSeed,
      city: citySeed,
    });
    return { ok: true, fields, researchBrief };
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
  // Geography FK is NOT NULL; BC remains the insert default. OGR/BC *AI* strategy
  // (persona, region rubric) is already gated via input.aiPersona / lineCode.
  const territory = await resolveTerritoryIdByCode(
    supabase,
    input.territoryCode?.trim() || BC_TERRITORY_CODE,
  );
  if ('error' in territory) {
    return { ok: false, error: territory.error };
  }

  const insertExtras = {
    websiteUrl: input.websiteUrl?.trim() || undefined,
    retailChannelHint: input.retailChannelHint?.trim() || undefined,
    territoryId: territory.id,
  };

  const firstId = await allocateNextId(supabase);
  if (typeof firstId === 'object') {
    return { ok: false, error: firstId.error };
  }

  const first = await insertProspect(supabase, firstId, fields, insertExtras);
  if (first.ok) {
    const contact = await insertBuyerContact(supabase, first.prospect.id, input);
    if (!contact.ok) {
      return { ok: false, error: contact.error };
    }
    const stamped = await stampLineAccountIfNeeded(supabase, input, first.prospect.id);
    if (!stamped.ok) {
      return { ok: false, error: stamped.error };
    }
    return { ok: true, prospect: first.prospect, researchBrief };
  }
  if (!isUniqueViolation(first.error)) {
    return first;
  }

  const retryId = await allocateNextId(supabase);
  if (typeof retryId === 'object') {
    return { ok: false, error: retryId.error };
  }
  const retry = await insertProspect(supabase, retryId, fields, insertExtras);
  if (retry.ok) {
    const contact = await insertBuyerContact(supabase, retry.prospect.id, input);
    if (!contact.ok) {
      return { ok: false, error: contact.error };
    }
    const stamped = await stampLineAccountIfNeeded(supabase, input, retry.prospect.id);
    if (!stamped.ok) {
      return { ok: false, error: stamped.error };
    }
    return { ok: true, prospect: retry.prospect, researchBrief };
  }
  return retry;
}
