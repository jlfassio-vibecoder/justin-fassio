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
import {
  locationChangedBetween,
  locationFingerprintFromProspect,
} from '@/lib/operationalTerritories/locationFingerprint';
import { runOperationalTerritoryReviewSyncAfterWrite } from '@/lib/operationalTerritories/syncOperationalTerritoryReview';
import {
  insertRetailerFieldChanges,
  isVerifiedIdentityField,
  isVerifiedIdentityStatus,
  type RetailerFieldChangeInsert,
} from '@/lib/retailerFieldChanges';
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

export type ApplyProspectResearchAiAudit = {
  actorId: string;
  salesLineId: string;
  retailerLineAccountId: string | null;
  confirmVerifiedOverwrite?: boolean;
};

function shouldSkipVerifiedIdentity(
  current: Prospect,
  audit: ApplyProspectResearchAiAudit | undefined,
): boolean {
  if (!audit || audit.confirmVerifiedOverwrite === true) return false;
  return isVerifiedIdentityStatus({
    buyerVerified: current.buyerVerified,
    verificationStatus: current.verificationStatus,
    importProtected: current.importProtected,
  });
}

async function writeAiFieldChanges(
  supabase: AgentSupabase,
  input: {
    retailerId: number;
    current: Prospect;
    patch: Record<string, unknown>;
    audit: ApplyProspectResearchAiAudit;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows: RetailerFieldChangeInsert[] = [];
  for (const [fieldPath, newValue] of Object.entries(input.patch)) {
    const camel = fieldPath.includes('_')
      ? fieldPath.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
      : fieldPath;
    const oldValue =
      (input.current as unknown as Record<string, unknown>)[camel] ??
      (input.current as unknown as Record<string, unknown>)[fieldPath];
    rows.push({
      retailerId: input.retailerId,
      fieldPath,
      oldValue: oldValue ?? null,
      newValue: newValue ?? null,
      source: 'ai',
      actorId: input.audit.actorId,
      salesLineId: input.audit.salesLineId,
      retailerLineAccountId: input.audit.retailerLineAccountId,
    });
  }
  if (rows.length === 0) return { ok: true };
  return insertRetailerFieldChanges(supabase, rows);
}

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
  input: {
    id: number;
    websiteUrl?: string;
    mode?: ProspectResearchMode;
    lineCode?: string;
    aiPersona?: string;
  },
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
      lineCode: input.lineCode,
      aiPersona: input.aiPersona,
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
    aiPersona: input.aiPersona,
    lineCode: input.lineCode,
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
    lineCode?: string;
    aiAudit?: ApplyProspectResearchAiAudit;
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
    const dbPatch = { ...merged.dbPatch } as Record<string, unknown>;
    if (input.aiAudit && shouldSkipVerifiedIdentity(existing.data, input.aiAudit)) {
      for (const key of Object.keys(dbPatch)) {
        if (isVerifiedIdentityField(key)) {
          delete dbPatch[key];
        }
      }
    }
    if (Object.keys(dbPatch).length === 0) {
      return { ok: true, prospect: existing.data };
    }

    const { data, error } = await supabase
      .from('prospects')
      .update(dbPatch as ProspectUpdate)
      .eq('id', input.id)
      .select(PROSPECT_SELECT)
      .single();

    if (error) {
      return { ok: false, error: error.message };
    }
    if (!data) {
      return { ok: false, error: 'Update returned no row' };
    }
    if (input.aiAudit) {
      const audit = await writeAiFieldChanges(supabase, {
        retailerId: input.id,
        current: existing.data,
        patch: dbPatch,
        audit: input.aiAudit,
      });
      if (!audit.ok) return audit;
    }
    const prospect = mapProspectRow(data as ProspectRow);
    const locationChanged = locationChangedBetween(
      locationFingerprintFromProspect(existing.data),
      locationFingerprintFromProspect(prospect),
    );
    await runOperationalTerritoryReviewSyncAfterWrite(supabase, prospect, { locationChanged });
    return { ok: true, prospect };
  }

  const parsed = enrichedProspectSchema.safeParse(input.fields);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid research fields' };
  }

  const fields = parsed.data;
  const fit = formatProspectFit(fields.fitScore, fields.notes);

  const patch: Record<string, unknown> = {
    name: fields.name.trim(),
    category: fields.category,
    region: fields.region?.trim() || '',
    city: fields.city?.trim() || '',
    address: fields.address?.trim() || '',
    phone: fields.phone?.trim() || '',
    fit,
  };

  let currentForAudit: Prospect | null = null;
  if (input.aiAudit) {
    const existing = await fetchProspectById(supabase, input.id);
    if (existing.error || !existing.data) {
      return { ok: false, error: existing.error ?? 'Prospect not found' };
    }
    currentForAudit = existing.data;
    if (shouldSkipVerifiedIdentity(existing.data, input.aiAudit)) {
      delete patch.name;
      delete patch.address;
      delete patch.phone;
      delete patch.city;
      delete patch.postal_code;
    }
  }

  const { data, error } = await supabase
    .from('prospects')
    .update(patch as ProspectUpdate)
    .eq('id', input.id)
    .select(PROSPECT_SELECT)
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: 'Update returned no row' };
  }
  if (input.aiAudit && currentForAudit) {
    const audit = await writeAiFieldChanges(supabase, {
      retailerId: input.id,
      current: currentForAudit,
      patch,
      audit: input.aiAudit,
    });
    if (!audit.ok) return audit;
  }

  const prospect = mapProspectRow(data as ProspectRow);
  const prior = currentForAudit ?? (await fetchProspectById(supabase, input.id)).data ?? prospect;
  const locationChanged = locationChangedBetween(
    locationFingerprintFromProspect(prior),
    locationFingerprintFromProspect(prospect),
  );
  await runOperationalTerritoryReviewSyncAfterWrite(supabase, prospect, { locationChanged });

  return { ok: true, prospect };
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
