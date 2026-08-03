import type { AgentSupabase } from '@/lib/agentAuth';
import {
  enrichedProspectSchema,
  formatProspectFit,
  inferEnrichedProspectFields,
  proposedProspectFromFields,
  type EnrichedProspectFields,
} from '@/lib/createEnrichedProspect';
import { mapProspectRow, type Prospect } from '@/lib/prospects';
import type { ProspectRow } from '@/types/database';

const PROSPECT_SELECT =
  'id, name, category, region, city, address, phone, fit, account_status, converted_at, initial_order_date, notes, created_at, updated_at' as const;

export type ProspectResearchPreview = {
  current: Prospect;
  proposed: Prospect;
  fields: EnrichedProspectFields;
  researchBrief: string | null;
};

export type PreviewProspectResearchResult =
  { ok: true; preview: ProspectResearchPreview } | { ok: false; error: string };

export type ApplyProspectResearchResult =
  { ok: true; prospect: Prospect } | { ok: false; error: string };

async function fetchProspectById(
  supabase: AgentSupabase,
  id: number,
): Promise<{ data: Prospect | null; error: string | null }> {
  const { data, error } = await supabase
    .from('prospects')
    .select(PROSPECT_SELECT)
    .eq('id', id)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }
  return { data: mapProspectRow(data as ProspectRow), error: null };
}

/**
 * AI Update Research — preview only (no DB write).
 * Re-researches the store and returns current vs proposed field values.
 */
export async function previewProspectResearchUpdate(
  supabase: AgentSupabase,
  input: { id: number; websiteUrl?: string },
): Promise<PreviewProspectResearchResult> {
  const existing = await fetchProspectById(supabase, input.id);
  if (existing.error || !existing.data) {
    return { ok: false, error: existing.error ?? 'Prospect not found' };
  }

  const current = existing.data;
  const inferred = await inferEnrichedProspectFields({
    companyName: current.name,
    websiteUrl: input.websiteUrl,
  });
  if (!inferred.ok) {
    return inferred;
  }

  return {
    ok: true,
    preview: {
      current,
      proposed: proposedProspectFromFields(current, inferred.fields),
      fields: inferred.fields,
      researchBrief: inferred.researchBrief,
    },
  };
}

/**
 * AI Update Research — apply confirmed fields to an existing prospect row.
 */
export async function applyProspectResearchUpdate(
  supabase: AgentSupabase,
  input: { id: number; fields: EnrichedProspectFields },
): Promise<ApplyProspectResearchResult> {
  const parsed = enrichedProspectSchema.safeParse(input.fields);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid research fields' };
  }

  const fields = parsed.data;
  const fit = formatProspectFit(fields.fitScore, fields.notes);

  const { data, error } = await supabase
    .from('prospects')
    .update({
      name: fields.name.trim(),
      category: fields.category,
      region: fields.region,
      city: fields.city.trim(),
      address: fields.address?.trim() || '',
      phone: fields.phone?.trim() || '',
      fit,
    })
    .eq('id', input.id)
    .select(PROSPECT_SELECT)
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: 'Update returned no row' };
  }

  return { ok: true, prospect: mapProspectRow(data as ProspectRow) };
}

export {
  buildResearchUpdateDiffs,
  RESEARCH_UPDATE_DIFF_KEYS,
  type ResearchUpdateDiffKey,
} from '@/lib/researchUpdateDiffs';
