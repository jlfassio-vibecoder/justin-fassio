import { generateObject } from 'ai';
import { z } from 'zod';
import { researchCompany } from '@/lib/companyWebResearch';
import {
  formatProspectFit,
  PROSPECT_CATEGORIES,
  PROSPECT_REGIONS,
} from '@/lib/createEnrichedProspect';
import {
  crmRegionFromTerritory,
  mapBcTerritory,
  type PrimaryDistrict,
  type Subterritory,
} from '@/lib/prospectEnrichment/bcTerritory';
import { crmChannelFromRetailCategory } from '@/lib/prospectEnrichment/crmChannelFromRetailCategory';
import {
  buildReasonForInclusion,
  recommendNextAction,
  verificationStatusFromEvidence,
} from '@/lib/prospectEnrichment/planningCopy';
import {
  assignProspectPriority,
  assignProvisionalGrade,
  isOkanaganSubterritory,
} from '@/lib/prospectEnrichment/priorityGrade';
import {
  normalizeRetailCategory,
  RETAIL_CATEGORIES,
  type RetailCategory,
} from '@/lib/prospectEnrichment/retailCategoryConfig';
import {
  calculateSeedFitScore,
  idealOpeningUnitsForCategory,
} from '@/lib/prospectEnrichment/seedFitScore';
import type { Prospect } from '@/lib/prospects';

/** Research-update mode: overwrite (Verify & Update) vs fill blanks only. */
export type ProspectResearchMode = 'update' | 'fill-blanks';

export const APPAREL_CAPABILITIES = ['Confirmed', 'Likely', 'Unknown', 'None'] as const;
export type ApparelCapability = (typeof APPAREL_CAPABILITIES)[number];

/** AI evidence only — no scores, priority, grade, or units. */
export const fillBlankEvidenceSchema = z.object({
  officialWebsite: z
    .string()
    .nullable()
    .describe('Official store website URL if found; otherwise null'),
  address: z
    .string()
    .nullable()
    .describe('Street address only if explicitly published; otherwise null'),
  phone: z.string().nullable().describe('Store phone only if explicitly published; otherwise null'),
  retailCategory: z
    .enum(RETAIL_CATEGORIES)
    .nullable()
    .describe('Canonical retail category or Other / needs review; null if unknown'),
  categoryRationale: z
    .string()
    .nullable()
    .describe('One short sentence of evidence for the category'),
  apparelCapability: z
    .enum(APPAREL_CAPABILITIES)
    .nullable()
    .describe('Confirmed/Likely/Unknown/None from public evidence only'),
  lifestyleThemes: z
    .array(z.string())
    .nullable()
    .describe('Relevant OGR themes evidenced (fishing, golf, etc.)'),
  customerAlignmentNotes: z
    .string()
    .nullable()
    .describe('Short notes on customer/gift alignment when evidenced'),
  strategicReference: z
    .boolean()
    .describe('True only with credible destination/reference evidence — not from keywords alone'),
  strategicReferenceReason: z
    .string()
    .nullable()
    .describe('Why strategic reference applies, or null'),
  operatingConfirmed: z
    .boolean()
    .describe('True if an official website or credible current source confirms operation'),
  directoryOnly: z.boolean().describe('True if evidence is only a directory/planning listing'),
  sourceUrls: z.array(z.string()).nullable().describe('Supporting URLs when available'),
});

export type FillBlankEvidence = z.infer<typeof fillBlankEvidenceSchema>;

/** Proposal fields after evidence + deterministic calculation (merge input). */
export const fillBlankProposalSchema = z.object({
  name: z.string().nullable(),
  category: z.enum(PROSPECT_CATEGORIES).nullable(),
  region: z.enum(PROSPECT_REGIONS).nullable(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  subterritory: z.string().nullable(),
  primaryDistrict: z.string().nullable(),
  retailCategory: z.string().nullable(),
  apparelCapability: z.string().nullable(),
  verificationStatus: z.string().nullable(),
  fitScore: z.number().int().min(1).max(10).nullable(),
  fit: z.string().nullable(),
  idealOpeningUnits: z.number().int().nullable(),
  priority: z.string().nullable(),
  provisionalGrade: z.string().nullable(),
  nextAction: z.string().nullable(),
});

export type FillBlankProspectFields = z.infer<typeof fillBlankProposalSchema>;

/** Apply-path schema for fill-blank proposal fields (not AI evidence). */
export const fillBlankProspectSchema = fillBlankProposalSchema;

export const FILL_BLANK_ALLOWLIST = [
  'name',
  'category',
  'region',
  'city',
  'address',
  'phone',
  'fit',
  'website',
  'subterritory',
  'primaryDistrict',
  'retailCategory',
  'fitScore',
  'apparelCapability',
  'verificationStatus',
  'idealOpeningUnits',
  'priority',
  'provisionalGrade',
  'nextAction',
] as const satisfies readonly (keyof Prospect)[];

export type FillBlankAllowlistKey = (typeof FILL_BLANK_ALLOWLIST)[number];

export function isBlankProspectValue(key: FillBlankAllowlistKey, value: unknown): boolean {
  if (key === 'fitScore' || key === 'idealOpeningUnits') {
    return value == null || (typeof value === 'number' && !Number.isFinite(value));
  }
  if (typeof value !== 'string') {
    return value == null;
  }
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (key === 'apparelCapability' && trimmed.toLowerCase() === 'unknown') return true;
  if (
    (key === 'subterritory' || key === 'primaryDistrict') &&
    trimmed.toLowerCase() === 'needs mapping'
  ) {
    return true;
  }
  return false;
}

function nonBlankString(value: string | null | undefined): string | null {
  const t = value?.trim() ?? '';
  return t ? t : null;
}

export type FillBlankMergeResult = {
  proposed: Prospect;
  dbPatch: Record<string, string | number | boolean | null>;
  filledKeys: FillBlankAllowlistKey[];
};

/**
 * Merge proposal onto current prospect — only allowlisted blanks.
 * Never touches externalId, buyerVerified, existingOgr.
 */
export function mergeFillBlankFields(
  current: Prospect,
  inferred: FillBlankProspectFields,
): FillBlankMergeResult {
  const proposed: Prospect = { ...current };
  const dbPatch: Record<string, string | number | boolean | null> = {};
  const filledKeys: FillBlankAllowlistKey[] = [];

  function fillString(key: FillBlankAllowlistKey, dbColumn: string, next: string | null) {
    if (!isBlankProspectValue(key, current[key])) return;
    const value = nonBlankString(next);
    if (!value) return;
    if (key === 'name') proposed.name = value;
    else if (key === 'city') proposed.city = value;
    else if (key === 'address') proposed.address = value;
    else if (key === 'phone') proposed.phone = value;
    else if (key === 'website') proposed.website = value;
    else if (key === 'subterritory') proposed.subterritory = value;
    else if (key === 'primaryDistrict') proposed.primaryDistrict = value;
    else if (key === 'retailCategory') proposed.retailCategory = value;
    else if (key === 'apparelCapability') proposed.apparelCapability = value;
    else if (key === 'verificationStatus') proposed.verificationStatus = value;
    else if (key === 'fit') proposed.fit = value;
    else if (key === 'priority') proposed.priority = value;
    else if (key === 'provisionalGrade') proposed.provisionalGrade = value;
    else if (key === 'nextAction') proposed.nextAction = value;
    dbPatch[dbColumn] = value;
    filledKeys.push(key);
  }

  fillString('name', 'name', inferred.name);
  if (isBlankProspectValue('category', current.category) && inferred.category) {
    proposed.category = inferred.category;
    dbPatch.category = inferred.category;
    filledKeys.push('category');
  }
  if (isBlankProspectValue('region', current.region) && inferred.region) {
    proposed.region = inferred.region;
    dbPatch.region = inferred.region;
    filledKeys.push('region');
  }
  fillString('city', 'city', inferred.city);
  fillString('address', 'address', inferred.address);
  fillString('phone', 'phone', inferred.phone);
  fillString('website', 'website', inferred.website);
  fillString('subterritory', 'subterritory', inferred.subterritory);
  fillString('primaryDistrict', 'primary_district', inferred.primaryDistrict);
  fillString('retailCategory', 'retail_category', inferred.retailCategory);
  fillString('apparelCapability', 'apparel_capability', inferred.apparelCapability);
  fillString('verificationStatus', 'verification_status', inferred.verificationStatus);
  fillString('priority', 'priority', inferred.priority);
  fillString('provisionalGrade', 'provisional_grade', inferred.provisionalGrade);
  fillString('nextAction', 'next_action', inferred.nextAction);
  fillString('fit', 'fit', inferred.fit);

  if (isBlankProspectValue('fitScore', current.fitScore) && inferred.fitScore != null) {
    proposed.fitScore = inferred.fitScore;
    dbPatch.fit_score = inferred.fitScore;
    filledKeys.push('fitScore');
  }

  if (
    isBlankProspectValue('idealOpeningUnits', current.idealOpeningUnits) &&
    inferred.idealOpeningUnits != null
  ) {
    proposed.idealOpeningUnits = inferred.idealOpeningUnits;
    dbPatch.ideal_opening_units = inferred.idealOpeningUnits;
    filledKeys.push('idealOpeningUnits');
  }

  return { proposed, dbPatch, filledKeys };
}

/**
 * Build fill-blank proposal from current row + AI evidence using deterministic scorers.
 */
export function buildFillBlankProposal(
  current: Prospect,
  evidence: FillBlankEvidence,
): FillBlankProspectFields {
  const retailCategory: RetailCategory =
    normalizeRetailCategory(current.retailCategory) ??
    normalizeRetailCategory(evidence.retailCategory) ??
    'Other / needs review';

  const territoryFromCity = mapBcTerritory({ city: current.city });
  const subterritory = !isBlankProspectValue('subterritory', current.subterritory)
    ? current.subterritory
    : territoryFromCity.subterritory !== 'Needs mapping'
      ? territoryFromCity.subterritory
      : null;
  const primaryDistrict = !isBlankProspectValue('primaryDistrict', current.primaryDistrict)
    ? current.primaryDistrict
    : territoryFromCity.primaryDistrict !== 'Needs mapping'
      ? territoryFromCity.primaryDistrict
      : null;

  const seed = calculateSeedFitScore({
    retailCategory,
    subterritory: subterritory ?? current.subterritory,
    strategicReference: evidence.strategicReference === true,
  });

  const fitScore = seed.seedFitScore;
  const priority = assignProspectPriority({
    fitScore,
    subterritory: subterritory ?? current.subterritory,
    inOkanagan: isOkanaganSubterritory(subterritory ?? current.subterritory),
    strategicReference: evidence.strategicReference === true,
  });
  const provisionalGrade = assignProvisionalGrade(priority);
  const idealOpeningUnits = idealOpeningUnitsForCategory(retailCategory);

  const website =
    nonBlankString(evidence.officialWebsite) ??
    (isBlankProspectValue('website', current.website) ? null : current.website);

  const apparel =
    evidence.apparelCapability && evidence.apparelCapability !== 'Unknown'
      ? evidence.apparelCapability
      : null;

  const verification = evidence.operatingConfirmed
    ? verificationStatusFromEvidence({
        hasOfficialWebsite: Boolean(website || evidence.operatingConfirmed),
        directoryOnly: evidence.directoryOnly,
      })
    : evidence.directoryOnly
      ? verificationStatusFromEvidence({ hasOfficialWebsite: false, directoryOnly: true })
      : null;

  const fitText = buildReasonForInclusion({
    retailCategory,
    customerAlignmentNotes: evidence.customerAlignmentNotes,
  });

  const nextAction = recommendNextAction({
    priority,
    hasWebsite: Boolean(website || current.website),
    apparelCapability: apparel ?? current.apparelCapability,
  });

  const channel = crmChannelFromRetailCategory(retailCategory);
  const region =
    crmRegionFromTerritory({
      primaryDistrict: (primaryDistrict as PrimaryDistrict | 'Needs mapping') ?? 'Needs mapping',
      subterritory: (subterritory as Subterritory) ?? 'Needs mapping',
    }) ?? null;

  const proposeRetailCategory = !isBlankProspectValue('retailCategory', current.retailCategory)
    ? null
    : retailCategory === 'Other / needs review' && !evidence.retailCategory
      ? null
      : retailCategory;

  return {
    name: null,
    category: channel,
    region,
    city: null,
    address: nonBlankString(evidence.address),
    phone: nonBlankString(evidence.phone),
    website: nonBlankString(evidence.officialWebsite),
    subterritory: !isBlankProspectValue('subterritory', current.subterritory) ? null : subterritory,
    primaryDistrict: !isBlankProspectValue('primaryDistrict', current.primaryDistrict)
      ? null
      : primaryDistrict,
    retailCategory: proposeRetailCategory,
    apparelCapability: apparel,
    verificationStatus: verification,
    fitScore,
    fit: formatProspectFit(fitScore, fitText),
    idealOpeningUnits,
    priority,
    provisionalGrade,
    nextAction,
  };
}

export type InferFillBlankResult =
  | {
      ok: true;
      fields: FillBlankProspectFields;
      evidence: FillBlankEvidence;
      researchBrief: string | null;
    }
  | { ok: false; error: string };

/**
 * Web research → evidence → deterministic proposal against the current CRM row.
 */
export async function inferFillBlankProspectFields(input: {
  current: Prospect;
  websiteUrl?: string;
}): Promise<InferFillBlankResult> {
  const current = input.current;
  const companyName = current.name.trim();
  if (!companyName) {
    return { ok: false, error: 'Company name is required' };
  }

  const websiteUrl = input.websiteUrl?.trim() || current.website?.trim() || undefined;
  const research = await researchCompany({
    companyName,
    websiteUrl,
    city: current.city,
    retailCategoryHint: current.retailCategory ?? undefined,
    fillBlanksFocus: true,
  });
  const researchBrief = research.brief;

  const researchBlock = researchBrief
    ? [
        'Web research brief (ground truth when present; do not invent beyond it):',
        researchBrief,
        'Set unsupported fields to null. Never invent buyer verification or Existing OGR.',
      ].join('\n')
    : 'No web research brief available; set address, phone, website, and uncertain fields to null.';

  try {
    const result = await generateObject({
      model: 'openai/gpt-4o',
      schema: fillBlankEvidenceSchema,
      schemaName: 'FillBlankEvidence',
      prompt: [
        'Extract public evidence for a BC wholesale apparel prospect. Do NOT invent scores, priority, grade, or opening units.',
        'Canonical retail categories must be one of the enum values (or Other / needs review).',
        'Apparel: Confirmed only with direct apparel evidence; Likely if format supports apparel; None if clearly no apparel; Unknown if unclear.',
        'strategicReference=true only with credible destination/reference evidence, not keywords alone.',
        `Company name: ${companyName}`,
        current.city ? `City: ${current.city}` : '',
        websiteUrl ? `Website hint: ${websiteUrl}` : 'No website hint.',
        researchBlock,
      ]
        .filter(Boolean)
        .join('\n'),
    });

    return {
      ok: true,
      evidence: result.object,
      fields: buildFillBlankProposal(current, result.object),
      researchBrief,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Fill-blank enrichment failed';
    return { ok: false, error: message };
  }
}
