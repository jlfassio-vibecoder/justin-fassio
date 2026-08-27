/**
 * Phase 2: AI intro/closing for agent product outreach drafts.
 * Never imports Resend. Subject stays deterministic via defaultOgrProductEmailSubject.
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  aiGatewayUserErrorMessage,
  ensureAiGatewayApiKey,
  staffGatewayModel,
} from '@/lib/aiGatewayEnv';
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
import { resolveOgrPricingMarketForProductEmailDraft } from '@/lib/resolveAccountPricingMarket';
import {
  buildPublicProductPresentation,
  PUBLIC_PRESENTATION_FORBIDDEN_KEYS,
} from '@/lib/publicProductPresentation';
import { mapProspectRow, PROSPECT_SELECT, type ProspectListRow } from '@/lib/prospects';
import {
  getAgentProductOutreachDraftById,
  insertAgentProductOutreachDraft,
  listAgentProductOutreachDrafts,
  requireExplicitProductOutreachCrmAssociation,
  updateAgentProductOutreachDraft,
  type ProductOutreachGenerationMeta,
  type ProductOutreachSystemMessagePayload,
  SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL,
} from '@/lib/systemMessages';
import { applyFrozenOutreachSelection } from '@/lib/outreachDraftSelection';
import {
  contextFlagsFromPack,
  hostnameFromWebsite,
  loadAcceptedResearchNotesForOutreach,
  loadOutreachCopyContextPack,
  OGR_OUTREACH_RESEARCH_NOTES_MAX,
  stripUrlsFromResearchNote,
  type OutreachCopyContextFlags,
  type OutreachLockedProfile,
} from '@/lib/outreachCopyContextPack';
import type { Database } from '@/types/database';

type DbClient = SupabaseClient<Database>;

export const OGR_OUTREACH_DRAFT_PROMPT_VERSION = 'v2';
export const OGR_OUTREACH_DRAFT_MODEL = 'openai/gpt-4o' as const;
export const OGR_OUTREACH_INTRO_PREFERRED_WORDS = 50;
export const OGR_OUTREACH_CLOSING_PREFERRED_WORDS = 40;
export const OGR_OUTREACH_BATCH_HTTP_MAX = 10;
export const OGR_OUTREACH_DESCRIPTION_MAX_CHARS = 400;
export {
  hostnameFromWebsite,
  loadAcceptedResearchNotesForOutreach,
  OGR_OUTREACH_RESEARCH_NOTES_MAX,
  stripUrlsFromResearchNote,
};

export type OutreachCopyMode = 'ai' | 'generic_stub';

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

/**
 * Remove a leading salutation — the send template already adds `Hi {name},`.
 */
export function stripLeadingOutreachGreeting(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^(hi|hello|hey|dear)\s+[A-Za-z][\w'.-]{0,39}\s*[,!.]\s*/i, '');
  text = text.replace(/^(hi|hello|hey)\s*[,!.]\s*/i, '');
  return text.trim();
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
  /** Hostname only (no scheme/path) when a store website is known. */
  storeWebsiteHost?: string;
  /** Short public notes from accepted research citations (no URLs). */
  recentPublicNotes?: string[];
  /** CRM contact role label (tone only — still no greeting by name). */
  contactRole?: string;
  /** CRM contact title when set. */
  contactTitle?: string;
  /** Locked sources as platform + hostname only. */
  lockedProfiles?: OutreachLockedProfile[];
  /** 1–3 clipped bullets from latest research brief. */
  researchBriefBullets?: string[];
  /** Yelp verified name/categories text (no listing URL). */
  directorySignals?: string;
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
    website?: string | null;
  } | null;
  recentPublicNotes?: string[];
  /** Prefer pack host over prospects.website when provided. */
  storeWebsiteHost?: string | null;
  contactRole?: string | null;
  contactTitle?: string | null;
  lockedProfiles?: OutreachLockedProfile[];
  researchBriefBullets?: string[];
  directorySignals?: string | null;
}): SafeOutreachPromptContext {
  const { target, product, prospect } = input;
  const channelLabels = [
    ...(target.primaryChannel ? [primaryRetailChannelLabel(target.primaryChannel)] : []),
    ...target.secondaryChannels.map((ch) => primaryRetailChannelLabel(ch)),
  ].filter(Boolean);

  const description = product.description.trim().slice(0, OGR_OUTREACH_DESCRIPTION_MAX_CHARS);
  const storeWebsiteHost =
    (typeof input.storeWebsiteHost === 'string' && input.storeWebsiteHost.trim()
      ? input.storeWebsiteHost.trim()
      : null) ?? hostnameFromWebsite(prospect?.website ?? null);
  const contactRole = input.contactRole?.trim() || '';
  const contactTitle = input.contactTitle?.trim() || '';
  const lockedProfiles = (input.lockedProfiles ?? []).filter(
    (p) => p.platform && p.hostname && !/^https?:\/\//i.test(p.hostname),
  );
  const researchBriefBullets = (input.researchBriefBullets ?? [])
    .map((b) => b.trim())
    .filter(Boolean);
  const directorySignals = input.directorySignals?.trim() || '';

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
    ...(storeWebsiteHost ? { storeWebsiteHost } : {}),
    ...(input.recentPublicNotes && input.recentPublicNotes.length > 0
      ? { recentPublicNotes: input.recentPublicNotes }
      : {}),
    ...(contactRole ? { contactRole } : {}),
    ...(contactTitle ? { contactTitle } : {}),
    ...(lockedProfiles.length > 0 ? { lockedProfiles } : {}),
    ...(researchBriefBullets.length > 0 ? { researchBriefBullets } : {}),
    ...(directorySignals ? { directorySignals } : {}),
  };
}

export function assertSafePromptContext(ctx: SafeOutreachPromptContext): void {
  const json = JSON.stringify(ctx);
  for (const key of PUBLIC_PRESENTATION_FORBIDDEN_KEYS) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`Forbidden presentation key leaked into prompt context: ${key}`);
    }
  }
  if (/https?:\/\//i.test(json)) {
    throw new Error('URL scheme leaked into prompt context');
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
    '- Do not greet or address the buyer by name (no "Hi Pam," / "Hello …"); the email template already adds the greeting.',
    `- Prefer intro under ${OGR_OUTREACH_INTRO_PREFERRED_WORDS} words and closing under ${OGR_OUTREACH_CLOSING_PREFERRED_WORDS} words.`,
    '- Closing should invite a brief reply or call — not spammy CTAs.',
  ];
  if (options.shorten) {
    lines.push(
      'SHORTEN: Previous draft was too long, greeted the buyer, or mentioned pricing. Rewrite shorter; remove any greeting and price language.',
    );
  }
  lines.push('', 'Context (use only what is present; skip empty fields):');
  lines.push(`Store name: ${ctx.prospectName}`);
  lines.push(`Buyer first name: ${ctx.toName}`);
  if (ctx.contactRole) lines.push(`Contact role: ${ctx.contactRole}`);
  if (ctx.contactTitle) lines.push(`Contact title: ${ctx.contactTitle}`);
  if (ctx.prospectCity) lines.push(`City: ${ctx.prospectCity}`);
  if (ctx.prospectRegion) lines.push(`Region: ${ctx.prospectRegion}`);
  if (ctx.channelLabels.length) lines.push(`Retail channels: ${ctx.channelLabels.join(', ')}`);
  if (ctx.prospectLifestyleLabels.length) {
    lines.push(`Store lifestyle themes: ${ctx.prospectLifestyleLabels.join(', ')}`);
  }
  if (ctx.prospectFit) lines.push(`Fit notes: ${ctx.prospectFit}`);
  if (ctx.storeWebsiteHost) lines.push(`Store website host: ${ctx.storeWebsiteHost}`);
  if (ctx.lockedProfiles && ctx.lockedProfiles.length > 0) {
    lines.push('Locked public profiles (hostname only; do not invent activity):');
    for (const profile of ctx.lockedProfiles) {
      lines.push(`- ${profile.platform}: ${profile.hostname}`);
    }
  }
  if (ctx.recentPublicNotes && ctx.recentPublicNotes.length > 0) {
    lines.push('Recent public notes (paraphrase lightly; do not invent; never paste URLs):');
    for (const note of ctx.recentPublicNotes) {
      lines.push(`- ${note}`);
    }
  }
  if (ctx.researchBriefBullets && ctx.researchBriefBullets.length > 0) {
    lines.push('Research brief bullets:');
    for (const bullet of ctx.researchBriefBullets) {
      lines.push(`- ${bullet}`);
    }
  }
  if (ctx.directorySignals) {
    lines.push(`Directory signals: ${ctx.directorySignals}`);
  }
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
  const introText = stripLeadingOutreachGreeting(sanitizeOutreachProse(raw.introText));
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
    ensureAiGatewayApiKey();
    const { object } = await generateObject({
      model: staffGatewayModel(OGR_OUTREACH_DRAFT_MODEL),
      schema: ogrOutreachDraftSchema,
      schemaName: 'OgrProductOutreachDraft',
      prompt,
      maxOutputTokens: 400,
    });
    return { ok: true, fields: object };
  } catch (err) {
    return { ok: false, error: aiGatewayUserErrorMessage(err) };
  }
}

export type ProduceOutreachCopyResult =
  | {
      ok: true;
      introText: string;
      closingText: string;
      fallback: OutreachDraftFallback;
      introWordCount: number;
      closingWordCount: number;
    }
  | { ok: false; error: string };

export async function produceOutreachCopy(
  ctx: SafeOutreachPromptContext,
): Promise<ProduceOutreachCopyResult> {
  const first = await callGenerateObject(buildOutreachDraftPrompt(ctx));
  if (!first.ok) {
    return { ok: false, error: first.error };
  }

  const firstNormalized = normalizeOutreachCopy(first.fields);
  if (!firstNormalized.needsRetry) {
    return {
      ok: true,
      introText: firstNormalized.introText,
      closingText: firstNormalized.closingText,
      fallback: firstNormalized.fallback,
      introWordCount: firstNormalized.introWordCount,
      closingWordCount: firstNormalized.closingWordCount,
    };
  }

  const second = await callGenerateObject(buildOutreachDraftPrompt(ctx, { shorten: true }));
  if (!second.ok) {
    // Keep a usable over-long first draft rather than silent stub defaults.
    if (firstNormalized.fallback === 'none') {
      return {
        ok: true,
        introText: firstNormalized.introText,
        closingText: firstNormalized.closingText,
        fallback: firstNormalized.fallback,
        introWordCount: firstNormalized.introWordCount,
        closingWordCount: firstNormalized.closingWordCount,
      };
    }
    return { ok: false, error: second.error };
  }

  const secondNormalized = normalizeOutreachCopy(second.fields);
  if (secondNormalized.fallback === 'defaults') {
    if (firstNormalized.fallback === 'none') {
      return {
        ok: true,
        introText: firstNormalized.introText,
        closingText: firstNormalized.closingText,
        fallback: firstNormalized.fallback,
        introWordCount: firstNormalized.introWordCount,
        closingWordCount: firstNormalized.closingWordCount,
      };
    }
    return { ok: false, error: 'Generated copy failed safety checks' };
  }

  // Prefer shortened AI copy even if still slightly over preferred words (under hard max).
  return {
    ok: true,
    introText: secondNormalized.introText,
    closingText: secondNormalized.closingText,
    fallback: 'retry_shorten',
    introWordCount: secondNormalized.introWordCount,
    closingWordCount: secondNormalized.closingWordCount,
  };
}

export type GenerateOgrProductOutreachDraftInput = {
  target: SelectedOutreachTarget;
  /** When empty/null, draft is inserted with sent_by null (cron without actor env). */
  userId: string | null;
  existingDraftId?: string;
  automationRunId?: string | null;
  /** When set (staff generate-draft with AI flag on), load published SKUs for this line only. */
  salesLineId?: string;
  retailerLineAccountId?: string | null;
  /**
   * `generic_stub` — prep path: defaults only, no AI.
   * `ai` — staff Add copy / research handoff (default).
   */
  copyMode?: OutreachCopyMode;
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
  website: string | null;
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
    website: prospect.website,
  };
}

function buildGenerationMeta(
  target: SelectedOutreachTarget,
  copy: {
    fallback: OutreachDraftFallback;
    introWordCount: number;
    closingWordCount: number;
  },
  copyStatus: 'stub' | 'ai',
  contextFlags?: OutreachCopyContextFlags | null,
): ProductOutreachGenerationMeta {
  return {
    promptVersion: OGR_OUTREACH_DRAFT_PROMPT_VERSION,
    model: copyStatus === 'stub' ? 'none' : OGR_OUTREACH_DRAFT_MODEL,
    preparationDate: target.preparationDate,
    selectionReasons: {
      priority: target.selectionReasons.priority,
      fitScore: target.selectionReasons.fitScore,
      channelMatch: target.selectionReasons.channelMatch,
      productFit: target.selectionReasons.productFit,
      exclusionsChecked: true,
    },
    primaryChannel: target.primaryChannel,
    secondaryChannels: [...target.secondaryChannels],
    productSalesRank: target.productSalesRank,
    fallback: copy.fallback,
    introWordCount: copy.introWordCount,
    closingWordCount: copy.closingWordCount,
    generatedAt: new Date().toISOString(),
    copyStatus,
    ...(contextFlags ? { contextFlags } : {}),
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
  let target = input.target;
  const userId = typeof input.userId === 'string' ? input.userId.trim() : '';
  const sentBy = userId || null;
  const copyMode: OutreachCopyMode = input.copyMode === 'generic_stub' ? 'generic_stub' : 'ai';

  const crm = await requireExplicitProductOutreachCrmAssociation(client, {
    prospectId: target.prospectId,
    accountContactId: target.accountContactId,
  });
  if (!crm.ok) return { ok: false, error: crm.error };

  // Resolve existing draft early so prep-frozen selection meta can feed AI context.
  let draftId = input.existingDraftId?.trim() || '';
  if (!draftId) {
    const pending = await listAgentProductOutreachDrafts(client, {
      prospectId: target.prospectId,
      ...(input.retailerLineAccountId
        ? { retailerLineAccountId: input.retailerLineAccountId }
        : {}),
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
    const existing = await getAgentProductOutreachDraftById(client, draftId);
    if (!existing.ok) return { ok: false, error: existing.error };
    target = applyFrozenOutreachSelection(target, existing.draft.payload.generation);
  }

  const loaded = await loadPublishedOgrProductForEmail(client, target.catalogItemId, {
    salesLineId: input.salesLineId,
  });
  if (!loaded.ok) {
    return { ok: false, error: loaded.message };
  }

  const emailMarket = (
    await resolveOgrPricingMarketForProductEmailDraft(client, {
      prospectId: target.prospectId,
      retailerLineAccountId: input.retailerLineAccountId,
    })
  ).publicMarket;
  const presentation = buildPublicProductPresentation(loaded.product, {
    salesVolumeRank: target.productSalesRank,
    publicMarket: emailMarket,
  });

  let copy: {
    introText: string;
    closingText: string;
    fallback: OutreachDraftFallback;
    introWordCount: number;
    closingWordCount: number;
  };
  let copyStatus: 'stub' | 'ai';
  let contextFlags: OutreachCopyContextFlags | null = null;

  if (copyMode === 'generic_stub') {
    copy = {
      introText: OGR_PRODUCT_EMAIL_DEFAULT_INTRO,
      closingText: OGR_PRODUCT_EMAIL_DEFAULT_CLOSING,
      fallback: 'defaults',
      introWordCount: countWords(OGR_PRODUCT_EMAIL_DEFAULT_INTRO),
      closingWordCount: countWords(OGR_PRODUCT_EMAIL_DEFAULT_CLOSING),
    };
    copyStatus = 'stub';
  } else {
    const prospectCtx = await loadProspectContext(client, target.prospectId);
    const pack = await loadOutreachCopyContextPack(
      client,
      target.prospectId,
      target.accountContactId,
    );
    contextFlags = contextFlagsFromPack(pack);
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
      prospect: prospectCtx
        ? {
            city: prospectCtx.city,
            region: prospectCtx.region,
            fit: prospectCtx.fit,
            lifestyleThemes: prospectCtx.lifestyleThemes,
            // Host comes from pack (lock preferred over CRM website).
            website: null,
          }
        : null,
      storeWebsiteHost: pack.storeWebsiteHost,
      recentPublicNotes: pack.recentPublicNotes,
      contactRole: pack.contactRole,
      contactTitle: pack.contactTitle,
      lockedProfiles: pack.lockedProfiles,
      researchBriefBullets: pack.researchBriefBullets,
      directorySignals: pack.directorySignals,
    });
    const produced = await produceOutreachCopy(promptCtx);
    if (!produced.ok) {
      return { ok: false, error: produced.error };
    }
    copy = {
      introText: produced.introText,
      closingText: produced.closingText,
      fallback: produced.fallback,
      introWordCount: produced.introWordCount,
      closingWordCount: produced.closingWordCount,
    };
    copyStatus = 'ai';
  }

  const subject = defaultOgrProductEmailSubject(presentation.name);
  const origin = resolvePublicSiteOrigin();
  const productHref =
    emailMarket === 'us'
      ? buildOgrProductUrl(presentation.slug, origin, 'us')
      : buildOgrProductUrl(presentation.slug, origin);
  const payload: ProductOutreachSystemMessagePayload = {
    sku: presentation.sku,
    name: presentation.name,
    slug: presentation.slug,
    productHref,
    ...(emailMarket === 'us' ? { publicMarket: 'us' as const } : {}),
    generation: buildGenerationMeta(target, copy, copyStatus, contextFlags),
  };

  if (draftId) {
    const updated = await updateAgentProductOutreachDraft(client, draftId, {
      toEmail: target.toEmail,
      toName: target.toName,
      subject,
      introText: copy.introText,
      closingText: copy.closingText,
      catalogItemId: target.catalogItemId,
      retailerLineAccountId: input.retailerLineAccountId,
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
    retailerLineAccountId: input.retailerLineAccountId,
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
  salesLineId?: string;
  /** Prep uses `generic_stub`; staff batch (if any) defaults to `ai`. */
  copyMode?: OutreachCopyMode;
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
      salesLineId: input.salesLineId,
      copyMode: input.copyMode,
    });
    if (!generated.ok) {
      results.push({ prospectId: target.prospectId, error: generated.error });
      continue;
    }
    results.push({ prospectId: target.prospectId, draftId: generated.draftId });
  }

  return { ok: true, results };
}
