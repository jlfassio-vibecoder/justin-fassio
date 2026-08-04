import type { AgentSupabase } from '@/lib/agentAuth';
import {
  enrichedProspectSchema,
  formatProspectFit,
  inferEnrichedProspectFields,
  proposedProspectFromFields,
  type EnrichedProspectFields,
} from '@/lib/createEnrichedProspect';
import {
  fillBlankProposalSchema,
  inferFillBlankProspectFields,
  mergeFillBlankFields,
  type FillBlankProspectFields,
  type ProspectResearchMode,
} from '@/lib/fillBlankProspectFields';
import { mapProspectRow, PROSPECT_SELECT, type Prospect } from '@/lib/prospects';
import type { Database, ProspectRow } from '@/types/database';

type ProspectUpdate = Database['public']['Tables']['prospects']['Update'];

export type ProspectResearchPreview = {
  current: Prospect;
  proposed: Prospect;
  fields: EnrichedProspectFields | FillBlankProspectFields;
  researchBrief: string | null;
  mode: ProspectResearchMode;
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

function parseResearchMode(mode: unknown): ProspectResearchMode {
  return mode === 'fill-blanks' ? 'fill-blanks' : 'update';
}

/**
 * AI Update Research — preview only (no DB write).
 * mode `update` overwrites core fields; `fill-blanks` only proposes empty web-fillable columns.
 */
export async function previewProspectResearchUpdate(
  supabase: AgentSupabase,
  input: { id: number; websiteUrl?: string; mode?: ProspectResearchMode },
): Promise<PreviewProspectResearchResult> {
  const mode = parseResearchMode(input.mode);
  const existing = await fetchProspectById(supabase, input.id);
  if (existing.error || !existing.data) {
    return { ok: false, error: existing.error ?? 'Prospect not found' };
  }

  const current = existing.data;
  const websiteUrl = input.websiteUrl?.trim() || current.website?.trim() || undefined;

  if (mode === 'fill-blanks') {
    const inferred = await inferFillBlankProspectFields({
      current,
      websiteUrl,
    });
    if (!inferred.ok) {
      return inferred;
    }
    const merged = mergeFillBlankFields(current, inferred.fields);
    return {
      ok: true,
      preview: {
        current,
        proposed: merged.proposed,
        fields: inferred.fields,
        researchBrief: inferred.researchBrief,
        mode,
      },
    };
  }

  const inferred = await inferEnrichedProspectFields({
    companyName: current.name,
    websiteUrl,
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
      mode,
    },
  };
}

/**
 * AI Update Research — apply confirmed fields to an existing prospect row.
 * fill-blanks re-fetches and re-merges so only currently-blank allowlisted columns are written.
 */
export async function applyProspectResearchUpdate(
  supabase: AgentSupabase,
  input: {
    id: number;
    fields: EnrichedProspectFields | FillBlankProspectFields;
    mode?: ProspectResearchMode;
  },
): Promise<ApplyProspectResearchResult> {
  const mode = parseResearchMode(input.mode);

  if (mode === 'fill-blanks') {
    const parsed = fillBlankProposalSchema.safeParse(input.fields);
    if (!parsed.success) {
      return { ok: false, error: 'Invalid fill-blank research fields' };
    }

    const existing = await fetchProspectById(supabase, input.id);
    if (existing.error || !existing.data) {
      return { ok: false, error: existing.error ?? 'Prospect not found' };
    }

    const merged = mergeFillBlankFields(existing.data, parsed.data);
    if (Object.keys(merged.dbPatch).length === 0) {
      return { ok: true, prospect: existing.data };
    }

    const { data, error } = await supabase
      .from('prospects')
      .update(merged.dbPatch as ProspectUpdate)
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
  FILL_BLANK_DIFF_KEYS,
  type ResearchUpdateDiffKey,
  type FillBlankDiffKey,
  type ResearchDiff,
} from '@/lib/researchUpdateDiffs';

export type { ProspectResearchMode, FillBlankProspectFields } from '@/lib/fillBlankProspectFields';
