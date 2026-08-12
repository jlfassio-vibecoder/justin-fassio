/**
 * Phase 2: AI intro/closing for agent product outreach drafts.
 * Never imports Resend. Subject stays deterministic via defaultOgrProductEmailSubject.
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { primaryRetailChannelLabel, lifestyleThemeLabel } from '@/lib/crmRetailTaxonomy';
import { OGR_PRODUCT_EMAIL_MAX_PROSE } from '@/lib/ogrProductEmailLimits';
import {
  defaultOgrProductEmailSubject,
  OGR_PRODUCT_EMAIL_DEFAULT_CLOSING,
  OGR_PRODUCT_EMAIL_DEFAULT_INTRO,
} from '@/lib/ogrProductOutreachEmail';
import type { SelectedOutreachTarget } from '@/lib/outreachSelectTargets';
import { AGENT_OUTREACH_PENDING_DRAFT_STATUSES } from '@/lib/outreachSelectionConstants';
import { loadPublishedOgrProductForEmail } from '@/lib/loadPublishedOgrProductForEmail';
import { buildOgrProductUrl, resolvePublicSiteOrigin } from '@/lib/productUrls';
import {
  buildPublicProductPresentation,
  PUBLIC_PRESENTATION_FORBIDDEN_KEYS,
} from '@/lib/publicProductPresentation';
import { mapProspectRow, PROSPECT_SELECT, type ProspectListRow } from '@/lib/prospects';
import {
  insertAgentProductOutreachDraft,
  listAgentProductOutreachDrafts,
  requireExplicitProductOutreachCrmAssociation,
  updateAgentProductOutreachDraft,
  type ProductOutreachGenerationMeta,
  type ProductOutreachSystemMessagePayload,
  SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL,
} from '@/lib/systemMessages';
import type { Database } from '@/types/database';

type DbClient = SupabaseClient<Database>;

export const OGR_OUTREACH_DRAFT_PROMPT_VERSION = 'v1';
export const OGR_OUTREACH_DRAFT_MODEL = 'openai/gpt-4o' as const;
export const OGR_OUTREACH_INTRO_PREFERRED_WORDS = 50;
export const OGR_OUTREACH_CLOSING_PREFERRED_WORDS = 40;
export const OGR_OUTREACH_BATCH_HTTP_MAX = 10;
export const OGR_OUTREACH_DESCRIPTION_MAX_CHARS = 400;

export const ogrOutreachDraftSchema = z.object({
  introText: z
    .string()
    .min(1)
    .max(OGR_PRODUCT_EMAIL_MAX_PROSE)
    .describe('Plain-text intro under 50 words. No HTML, URLs, prices, or CRM ids.'),
  closingText: z
    .string()
    .min(1)
    .max(OGR_PRODUCT_EMAIL_MAX_PROSE)
    .describe('Plain-text closing under 40 words. Invite a reply or call. No HTML.'),
});

export type OgrOutreachDraftFields = z.infer<typeof ogrOutreachDraftSchema>;

export type OutreachDraftFallback = ProductOutreachGenerationMeta['fallback'];

const PRICING_PATTERN = /\$|\bUSD\b|\bCAD\b|\bwholesale\b|\blanded\b|\bMSRP\b|\bcost\b/i;

/** Count whitespace-separated words (empty → 0). */
export function countWords(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Strip tags / entities and collapse whitespace to plain text. */
export function sanitizeOutreachProse(raw: string): string {
  let text = raw.replace(/<[^>]*>/g, ' ');
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > OGR_PRODUCT_EMAIL_MAX_PROSE) {
    text = text.slice(0, OGR_PRODUCT_EMAIL_MAX_PROSE).trim();
  }
  return text;
}

export function proseLooksUnsafe(value: string): boolean {
  return /<|>|javascript:/i.test(value);
}

export function proseContainsPricingLanguage(value: string): boolean {
  return PRICING_PATTERN.test(value);
}

export function proseExceedsPreferredWords(introText: string, closingText: string): boolean {
  return (
    countWords(introText) > OGR_OUTREACH_INTRO_PREFERRED_WORDS ||
    countWords(closingText) > OGR_OUTREACH_CLOSING_PREFERRED_WORDS
  );
}

export type SafeOutreachPromptContext = {
  prospectName: string;
  toName: string;
  channelLabels: string[];
  productName: string;
  productIsNew: boolean;
  productSalesRank: number | null;
  productTagline: string;
  productDescription: string;
  productCategory: string;
  productLifestyleLabels: string[];
  prospectCity: string;
  prospectRegion: string;
  prospectFit: string;
  prospectLifestyleLabels: string[];
  channelMatch: boolean;
  productFit: SelectedOutreachTarget['selectionReasons']['productFit'];
};

/** Build allowlisted prompt context — never includes emails, ids, URLs, or forbidden keys. */
export function buildSafeOutreachPromptContext(input: {
  target: SelectedOutreachTarget;
  product: {
    name: string;
    tagline: string;
    description: string;
    category: string;
    lifestyleThemeLabels: string[];
    isNew: boolean;
  };
  prospect: {
    city: string;
    region: string;
    fit: string;
    lifestyleThemes: string[];
  } | null;
}): SafeOutreachPromptContext {
  const { target, product, prospect } = input;
  const channelLabels = [
    ...(target.primaryChannel ? [primaryRetailChannelLabel(target.primaryChannel)] : []),
    ...target.secondaryChannels.map((ch) => primaryRetailChannelLabel(ch)),
  ].filter(Boolean);

  const description = product.description.trim().slice(0, OGR_OUTREACH_DESCRIPTION_MAX_CHARS);

  return {
    prospectName: target.prospectName.trim(),
    toName: target.toName.trim(),
    channelLabels,
    productName: product.name.trim() || target.productName,
    productIsNew: product.isNew || target.productIsNew,
    productSalesRank: target.productSalesRank,
    productTagline: product.tagline.trim(),
    productDescription: description,
    productCategory: product.category.trim(),
    productLifestyleLabels: product.lifestyleThemeLabels.filter(Boolean),
    prospectCity: prospect?.city?.trim() || '',
    prospectRegion: prospect?.region?.trim() || '',
    prospectFit: prospect?.fit?.trim() || '',
    prospectLifestyleLabels: (prospect?.lifestyleThemes ?? [])
      .map((t) => lifestyleThemeLabel(t) || t)
      .filter(Boolean),
    channelMatch: target.selectionReasons.channelMatch,
    productFit: target.selectionReasons.productFit,
  };
}

export function assertSafePromptContext(ctx: SafeOutreachPromptContext): void {
  const json = JSON.stringify(ctx);
  for (const key of PUBLIC_PRESENTATION_FORBIDDEN_KEYS) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`Forbidden presentation key leaked into prompt context: ${key}`);
    }
  }
}

export function buildOutreachDraftPrompt(
  ctx: SafeOutreachPromptContext,
  options: { shorten?: boolean } = {},
): string {
  assertSafePromptContext(ctx);
  const lines: string[] = [
    'You write short wholesale outreach intro and closing copy for Old Guys Rule apparel.',
    'Return ONLY introText and closingText as plain text.',
    'Rules:',
    '- Pique interest; do not close the sale or hard-pitch.',
    '- No HTML, markdown links, URLs, email addresses, or CRM/product IDs.',
    '- No pricing, wholesale, landed, MSRP, USD/CAD, or cost language.',
    '- Do not invent facts (city, buyer title, inventory, availability).',
    '- Do not write a subject line, From header, or signature.',
    `- Prefer intro under ${OGR_OUTREACH_INTRO_PREFERRED_WORDS} words and closing under ${OGR_OUTREACH_CLOSING_PREFERRED_WORDS} words.`,
    '- Closing should invite a brief reply or call — not spammy CTAs.',
  ];
  if (options.shorten) {
    lines.push(
      'SHORTEN: Previous draft was too long or mentioned pricing. Rewrite shorter and remove any price language.',
    );
  }
  lines.push('', 'Context (use only what is present; skip empty fields):');
  lines.push(`Store name: ${ctx.prospectName}`);
  lines.push(`Buyer first name: ${ctx.toName}`);
  if (ctx.prospectCity) lines.push(`City: ${ctx.prospectCity}`);
  if (ctx.prospectRegion) lines.push(`Region: ${ctx.prospectRegion}`);
  if (ctx.channelLabels.length) lines.push(`Retail channels: ${ctx.channelLabels.join(', ')}`);
  if (ctx.prospectLifestyleLabels.length) {
    lines.push(`Store lifestyle themes: ${ctx.prospectLifestyleLabels.join(', ')}`);
  }
  if (ctx.prospectFit) lines.push(`Fit notes: ${ctx.prospectFit}`);
  lines.push(`Product name: ${ctx.productName}`);
  if (ctx.productCategory) lines.push(`Product category: ${ctx.productCategory}`);
  if (ctx.productTagline) lines.push(`Product tagline: ${ctx.productTagline}`);
  if (ctx.productDescription) lines.push(`Product description: ${ctx.productDescription}`);
  if (ctx.productIsNew) lines.push('Product flag: New');
  if (ctx.productSalesRank != null) lines.push(`Sales rank hint: #${ctx.productSalesRank}`);
  if (ctx.productLifestyleLabels.length) {
    lines.push(`Product lifestyle themes: ${ctx.productLifestyleLabels.join(', ')}`);
  }
  lines.push(`Channel match to allocation: ${ctx.channelMatch ? 'yes' : 'no'}`);
  lines.push(`Product fit: ${ctx.productFit}`);
  return lines.join('\n');
}

export type NormalizeOutreachCopyResult = {
  introText: string;
  closingText: string;
  fallback: OutreachDraftFallback;
  introWordCount: number;
  closingWordCount: number;
  needsRetry: boolean;
};

export function normalizeOutreachCopy(raw: {
  introText: string;
  closingText: string;
}): NormalizeOutreachCopyResult {
  const introText = sanitizeOutreachProse(raw.introText);
  const closingText = sanitizeOutreachProse(raw.closingText);

  if (
    !introText ||
    !closingText ||
    proseLooksUnsafe(introText) ||
    proseLooksUnsafe(closingText) ||
    proseContainsPricingLanguage(introText) ||
    proseContainsPricingLanguage(closingText)
  ) {
    return {
      introText: OGR_PRODUCT_EMAIL_DEFAULT_INTRO,
      closingText: OGR_PRODUCT_EMAIL_DEFAULT_CLOSING,
      fallback: 'defaults',
      introWordCount: countWords(OGR_PRODUCT_EMAIL_DEFAULT_INTRO),
      closingWordCount: countWords(OGR_PRODUCT_EMAIL_DEFAULT_CLOSING),
      needsRetry: true,
    };
  }

  const needsRetry = proseExceedsPreferredWords(introText, closingText);
  return {
    introText,
    closingText,
    fallback: 'none',
    introWordCount: countWords(introText),
    closingWordCount: countWords(closingText),
    needsRetry,
  };
}

async function callGenerateObject(
  prompt: string,
): Promise<{ ok: true; fields: OgrOutreachDraftFields } | { ok: false; error: string }> {
  try {
    const { object } = await generateObject({
      model: OGR_OUTREACH_DRAFT_MODEL,
      schema: ogrOutreachDraftSchema,
      schemaName: 'OgrProductOutreachDraft',
      prompt,
      maxOutputTokens: 400,
    });
    return { ok: true, fields: object };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Draft generation failed';
    return { ok: false, error: message };
  }
}

export async function produceOutreachCopy(ctx: SafeOutreachPromptContext): Promise<{
  introText: string;
  closingText: string;
  fallback: OutreachDraftFallback;
  introWordCount: number;
  closingWordCount: number;
}> {
  const first = await callGenerateObject(buildOutreachDraftPrompt(ctx));
  if (!first.ok) {
    return {
      introText: OGR_PRODUCT_EMAIL_DEFAULT_INTRO,
      closingText: OGR_PRODUCT_EMAIL_DEFAULT_CLOSING,
      fallback: 'defaults',
      introWordCount: countWords(OGR_PRODUCT_EMAIL_DEFAULT_INTRO),
      closingWordCount: countWords(OGR_PRODUCT_EMAIL_DEFAULT_CLOSING),
    };
  }

  let normalized = normalizeOutreachCopy(first.fields);
  if (!normalized.needsRetry) {
    return {
      introText: normalized.introText,
      closingText: normalized.closingText,
      fallback: normalized.fallback,
      introWordCount: normalized.introWordCount,
      closingWordCount: normalized.closingWordCount,
    };
  }

  const second = await callGenerateObject(buildOutreachDraftPrompt(ctx, { shorten: true }));
  if (!second.ok) {
    return {
      introText: OGR_PRODUCT_EMAIL_DEFAULT_INTRO,
      closingText: OGR_PRODUCT_EMAIL_DEFAULT_CLOSING,
      fallback: 'defaults',
      introWordCount: countWords(OGR_PRODUCT_EMAIL_DEFAULT_INTRO),
      closingWordCount: countWords(OGR_PRODUCT_EMAIL_DEFAULT_CLOSING),
    };
  }

  normalized = normalizeOutreachCopy(second.fields);
  if (normalized.fallback === 'defaults') {
    return {
      introText: normalized.introText,
      closingText: normalized.closingText,
      fallback: 'defaults',
      introWordCount: normalized.introWordCount,
      closingWordCount: normalized.closingWordCount,
    };
  }

  // Prefer shortened AI copy even if still slightly over preferred words (under hard max).
  return {
    introText: normalized.introText,
    closingText: normalized.closingText,
    fallback: 'retry_shorten',
    introWordCount: normalized.introWordCount,
    closingWordCount: normalized.closingWordCount,
  };
}

export type GenerateOgrProductOutreachDraftInput = {
  target: SelectedOutreachTarget;
  /** When empty/null, draft is inserted with sent_by null (cron without actor env). */
  userId: string | null;
  existingDraftId?: string;
  automationRunId?: string | null;
};

export type GenerateOgrProductOutreachDraftResult =
  | {
      ok: true;
      draftId: string;
      fallback: OutreachDraftFallback;
      subject: string;
      introText: string;
      closingText: string;
    }
  | { ok: false; error: string };

async function loadProspectContext(
  client: DbClient,
  prospectId: number,
): Promise<{
  city: string;
  region: string;
  fit: string;
  lifestyleThemes: string[];
} | null> {
  const { data, error } = await client
    .from('prospects')
    .select(PROSPECT_SELECT)
    .eq('id', prospectId)
    .maybeSingle();
  if (error || !data) return null;
  const prospect = mapProspectRow(data as ProspectListRow);
  return {
    city: prospect.city,
    region: prospect.region,
    fit: prospect.fit,
    lifestyleThemes: prospect.lifestyleThemes,
  };
}

function buildGenerationMeta(
  target: SelectedOutreachTarget,
  copy: {
    fallback: OutreachDraftFallback;
    introWordCount: number;
    closingWordCount: number;
  },
): ProductOutreachGenerationMeta {
  return {
    promptVersion: OGR_OUTREACH_DRAFT_PROMPT_VERSION,
    model: OGR_OUTREACH_DRAFT_MODEL,
    preparationDate: target.preparationDate,
    selectionReasons: target.selectionReasons,
    primaryChannel: target.primaryChannel,
    fallback: copy.fallback,
    introWordCount: copy.introWordCount,
    closingWordCount: copy.closingWordCount,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate intro/closing for one frozen Phase 1 target and insert/update an agent draft.
 * Never calls Resend. Never re-runs eligibility.
 */
export async function generateOgrProductOutreachDraft(
  client: DbClient,
  input: GenerateOgrProductOutreachDraftInput,
): Promise<GenerateOgrProductOutreachDraftResult> {
  const { target } = input;
  const userId = typeof input.userId === 'string' ? input.userId.trim() : '';
  const sentBy = userId || null;

  const crm = await requireExplicitProductOutreachCrmAssociation(client, {
    prospectId: target.prospectId,
    accountContactId: target.accountContactId,
  });
  if (!crm.ok) return { ok: false, error: crm.error };

  const loaded = await loadPublishedOgrProductForEmail(client, target.catalogItemId);
  if (!loaded.ok) {
    return { ok: false, error: loaded.message };
  }

  const presentation = buildPublicProductPresentation(loaded.product, {
    salesVolumeRank: target.productSalesRank,
  });
  const prospectCtx = await loadProspectContext(client, target.prospectId);
  const promptCtx = buildSafeOutreachPromptContext({
    target,
    product: {
      name: presentation.name,
      tagline: presentation.tagline,
      description: presentation.description,
      category: presentation.category,
      lifestyleThemeLabels: presentation.lifestyleThemeLabels,
      isNew: presentation.isNew,
    },
    prospect: prospectCtx,
  });

  const copy = await produceOutreachCopy(promptCtx);
  const subject = defaultOgrProductEmailSubject(presentation.name);
  const productHref = buildOgrProductUrl(resolvePublicSiteOrigin(), presentation.slug);
  const payload: ProductOutreachSystemMessagePayload = {
    sku: presentation.sku,
    name: presentation.name,
    slug: presentation.slug,
    productHref,
    generation: buildGenerationMeta(target, copy),
  };

  let draftId = input.existingDraftId?.trim() || '';

  if (!draftId) {
    const pending = await listAgentProductOutreachDrafts(client, {
      prospectId: target.prospectId,
      statuses: [...AGENT_OUTREACH_PENDING_DRAFT_STATUSES],
      limit: 5,
    });
    if (!pending.ok) return { ok: false, error: pending.error };
    const match = pending.drafts.find(
      (d) => d.status === 'draft' && d.origin === SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL,
    );
    if (match) draftId = match.id;
  }

  if (draftId) {
    const updated = await updateAgentProductOutreachDraft(client, draftId, {
      toEmail: target.toEmail,
      toName: target.toName,
      subject,
      introText: copy.introText,
      closingText: copy.closingText,
      catalogItemId: target.catalogItemId,
      payload,
    });
    if (!updated.ok) return { ok: false, error: updated.error };
    return {
      ok: true,
      draftId: updated.draft.id,
      fallback: copy.fallback,
      subject,
      introText: copy.introText,
      closingText: copy.closingText,
    };
  }

  const inserted = await insertAgentProductOutreachDraft(client, {
    catalogItemId: target.catalogItemId,
    toEmail: target.toEmail,
    toName: target.toName,
    subject,
    introText: copy.introText,
    closingText: copy.closingText,
    prospectId: target.prospectId,
    accountContactId: target.accountContactId,
    sentBy,
    payload,
    automationRunId: input.automationRunId ?? null,
  });
  if (!inserted.ok) return { ok: false, error: inserted.error };

  return {
    ok: true,
    draftId: inserted.id,
    fallback: copy.fallback,
    subject,
    introText: copy.introText,
    closingText: copy.closingText,
  };
}

export type GenerateOgrProductOutreachDraftsInput = {
  targets: SelectedOutreachTarget[];
  userId: string | null;
  regenerate?: boolean;
  automationRunId?: string | null;
};

export type GenerateOgrProductOutreachDraftsResult = {
  ok: true;
  results: Array<{ prospectId: number; draftId?: string; error?: string; skipped?: boolean }>;
};

/**
 * Batch generate (sequential). Skips prospects with pending drafts unless regenerate=true.
 */
export async function generateOgrProductOutreachDrafts(
  client: DbClient,
  input: GenerateOgrProductOutreachDraftsInput,
): Promise<GenerateOgrProductOutreachDraftsResult> {
  const results: GenerateOgrProductOutreachDraftsResult['results'] = [];

  for (const target of input.targets) {
    if (!input.regenerate) {
      const pending = await listAgentProductOutreachDrafts(client, {
        prospectId: target.prospectId,
        statuses: [...AGENT_OUTREACH_PENDING_DRAFT_STATUSES],
        limit: 1,
      });
      if (pending.ok && pending.drafts.length > 0) {
        results.push({
          prospectId: target.prospectId,
          draftId: pending.drafts[0]?.id,
          skipped: true,
        });
        continue;
      }
    }

    const generated = await generateOgrProductOutreachDraft(client, {
      target,
      userId: input.userId,
      automationRunId: input.automationRunId,
    });
    if (!generated.ok) {
      results.push({ prospectId: target.prospectId, error: generated.error });
      continue;
    }
    results.push({ prospectId: target.prospectId, draftId: generated.draftId });
  }

  return { ok: true, results };
}
