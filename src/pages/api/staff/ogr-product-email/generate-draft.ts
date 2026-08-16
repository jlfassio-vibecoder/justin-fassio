import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { checkAgentRateLimit, rateLimitResponse } from '@/lib/agentRateLimit';
import { gateStaffAiContext, parseOptionalUuidField } from '@/lib/aiLineContext';
import {
  generateOgrProductOutreachDraft,
  generateOgrProductOutreachDrafts,
  OGR_OUTREACH_BATCH_HTTP_MAX,
} from '@/lib/generateOgrProductOutreachDraft';
import {
  jsonError,
  jsonOk,
  rejectUnsupportedSendFields,
  requireAccountContactId,
  requireProductId,
  requireRecipientEmail,
} from '@/lib/ogrProductEmailDraftApi';
import type { SelectedOutreachTarget } from '@/lib/outreachSelectTargets';
import { getStaffFeatureFlags } from '@/lib/staffFeatures';

export const prerender = false;

export const EAGLE_PEAK_OUTREACH_DISABLED = 'Eagle Peak outreach is not enabled';
export const BIG_FISH_OUTREACH_DISABLED = 'Big Fish outreach is not enabled';
export const EAGLE_PEAK_CATALOG_EMPTY = 'Catalog is empty for this sales line';

export function assertEaglePeakGenerateDraftAllowed(input: {
  lineCode: string | null | undefined;
  outreachEnabled: boolean;
}): { ok: true } | { ok: false; status: 403; error: string } {
  if (input.lineCode === 'eagle-peak' && !input.outreachEnabled) {
    return { ok: false, status: 403, error: EAGLE_PEAK_OUTREACH_DISABLED };
  }
  return { ok: true };
}

export function assertBigFishGenerateDraftAllowed(input: {
  lineCode: string | null | undefined;
  outreachEnabled: boolean;
}): { ok: true } | { ok: false; status: 403; error: string } {
  if (input.lineCode === 'big-fish' && !input.outreachEnabled) {
    return { ok: false, status: 403, error: BIG_FISH_OUTREACH_DISABLED };
  }
  return { ok: true };
}

export function assertEaglePeakCatalogReadyForDraft(
  itemCount: number,
): { ok: true } | { ok: false; status: 400; error: string } {
  if (itemCount <= 0) {
    return { ok: false, status: 400, error: EAGLE_PEAK_CATALOG_EMPTY };
  }
  return { ok: true };
}

function isSelectionReasons(value: unknown): value is SelectedOutreachTarget['selectionReasons'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return (
    r.exclusionsChecked === true &&
    typeof r.channelMatch === 'boolean' &&
    (r.productFit === 'channel_intersect' || r.productFit === 'global_fallback') &&
    (r.priority == null || typeof r.priority === 'string') &&
    (r.fitScore == null || typeof r.fitScore === 'number')
  );
}

function parseTarget(
  raw: unknown,
): { ok: true; value: SelectedOutreachTarget } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'target must be an object' };
  }
  const t = raw as Record<string, unknown>;
  if (typeof t.preparationDate !== 'string' || !t.preparationDate.trim()) {
    return { ok: false, error: 'target.preparationDate is required' };
  }
  if (typeof t.prospectId !== 'number' || !Number.isFinite(t.prospectId)) {
    return { ok: false, error: 'target.prospectId is required' };
  }
  if (typeof t.prospectName !== 'string' || !t.prospectName.trim()) {
    return { ok: false, error: 'target.prospectName is required' };
  }

  const accountContactId = requireAccountContactId(t.accountContactId);
  if (!accountContactId.ok) {
    return { ok: false, error: `target.${accountContactId.error}` };
  }

  const toEmail = requireRecipientEmail(t.toEmail);
  if (!toEmail.ok) {
    return { ok: false, error: `target.${toEmail.error}` };
  }

  if (typeof t.toName !== 'string' || !t.toName.trim()) {
    return { ok: false, error: 'target.toName is required' };
  }

  const catalogItemId = requireProductId(t.catalogItemId);
  if (!catalogItemId.ok) {
    return { ok: false, error: 'target.catalogItemId must be a valid UUID' };
  }

  if (typeof t.productSku !== 'string' || typeof t.productName !== 'string') {
    return { ok: false, error: 'target product fields are required' };
  }
  if (typeof t.productSlug !== 'string' || typeof t.productIsNew !== 'boolean') {
    return { ok: false, error: 'target product fields are required' };
  }
  if (!isSelectionReasons(t.selectionReasons)) {
    return { ok: false, error: 'target.selectionReasons is invalid' };
  }
  if (t.secondaryChannels != null && !Array.isArray(t.secondaryChannels)) {
    return { ok: false, error: 'target.secondaryChannels must be an array' };
  }

  return {
    ok: true,
    value: {
      preparationDate: t.preparationDate.trim(),
      prospectId: t.prospectId,
      prospectName: t.prospectName.trim(),
      accountContactId: accountContactId.value,
      toEmail: toEmail.value,
      toName: t.toName.trim(),
      primaryChannel:
        typeof t.primaryChannel === 'string'
          ? (t.primaryChannel as SelectedOutreachTarget['primaryChannel'])
          : null,
      secondaryChannels: Array.isArray(t.secondaryChannels)
        ? (t.secondaryChannels as SelectedOutreachTarget['secondaryChannels'])
        : [],
      catalogItemId: catalogItemId.value,
      productSku: t.productSku,
      productName: t.productName,
      productSlug: t.productSlug,
      productIsNew: t.productIsNew,
      productSalesRank: typeof t.productSalesRank === 'number' ? t.productSalesRank : null,
      selectionReasons: t.selectionReasons,
    },
  };
}

/**
 * Generate agent product outreach draft(s) from frozen Phase 1 target(s).
 * Never calls Resend. Subject/intro/closing from AI defaults — client prose ignored.
 */
export const POST: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const limited = checkAgentRateLimit(`generate-draft:${gate.userId}`);
  if (!limited.ok) {
    return rateLimitResponse(limited.retryAfterSec);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const unsupported = rejectUnsupportedSendFields(body);
  if (unsupported) return jsonError(unsupported, 400);

  const firstTarget = Array.isArray(body.targets) ? body.targets[0] : body.target;
  const firstProspectId =
    firstTarget && typeof firstTarget === 'object' && !Array.isArray(firstTarget)
      ? (firstTarget as { prospectId?: unknown }).prospectId
      : undefined;
  const prospectId =
    typeof firstProspectId === 'number' && Number.isFinite(firstProspectId)
      ? firstProspectId
      : null;

  const gated = await gateStaffAiContext({
    client: gate.supabase,
    salesLineId: parseOptionalUuidField(body.salesLineId),
    retailerLineAccountId: parseOptionalUuidField(body.retailerLineAccountId),
    prospectId,
    kind: prospectId != null ? 'account' : 'line_level',
  });
  if (!gated.ok) {
    return jsonError(gated.error, gated.status);
  }
  if (gated.ctx?.mode === 'research_only') {
    return jsonError('Outreach generate is not available for this sales line', 403);
  }

  const outreachGate = assertEaglePeakGenerateDraftAllowed({
    lineCode: gated.ctx?.code,
    outreachEnabled: getStaffFeatureFlags().FEATURE_EAGLE_PEAK_OUTREACH,
  });
  if (!outreachGate.ok) {
    return jsonError(outreachGate.error, outreachGate.status);
  }
  const bigFishOutreachGate = assertBigFishGenerateDraftAllowed({
    lineCode: gated.ctx?.code,
    outreachEnabled: getStaffFeatureFlags().FEATURE_BIG_FISH_OUTREACH,
  });
  if (!bigFishOutreachGate.ok) {
    return jsonError(bigFishOutreachGate.error, bigFishOutreachGate.status);
  }

  if (gated.ctx?.code === 'eagle-peak' || gated.ctx?.code === 'big-fish') {
    const { count, error: catalogError } = await gate.supabase
      .from('catalog_items')
      .select('id', { count: 'exact', head: true })
      .eq('line_id', gated.ctx.salesLineId);
    if (catalogError) {
      return jsonError(catalogError.message, 400);
    }
    const catalogGate = assertEaglePeakCatalogReadyForDraft(count ?? 0);
    if (!catalogGate.ok) {
      return jsonError(catalogGate.error, catalogGate.status);
    }
  }

  if (body.targets != null) {
    if (!Array.isArray(body.targets)) {
      return jsonError('targets must be an array', 400);
    }
    if (body.targets.length === 0) {
      return jsonError('targets must not be empty', 400);
    }
    if (body.targets.length > OGR_OUTREACH_BATCH_HTTP_MAX) {
      return jsonError(`targets exceeds max of ${OGR_OUTREACH_BATCH_HTTP_MAX}`, 400);
    }
    const targets: SelectedOutreachTarget[] = [];
    for (const raw of body.targets) {
      const parsed = parseTarget(raw);
      if (!parsed.ok) return jsonError(parsed.error, 400);
      targets.push(parsed.value);
    }
    const regenerate = body.regenerate === true;
    const batch = await generateOgrProductOutreachDrafts(gate.supabase, {
      targets,
      userId: gate.userId,
      regenerate,
      salesLineId: gated.ctx?.salesLineId,
    });
    return jsonOk({ results: batch.results });
  }

  if (body.target == null) {
    return jsonError('target or targets is required', 400);
  }
  const parsed = parseTarget(body.target);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  const existingDraftId =
    typeof body.existingDraftId === 'string' && body.existingDraftId.trim()
      ? body.existingDraftId.trim()
      : undefined;

  const generated = await generateOgrProductOutreachDraft(gate.supabase, {
    target: parsed.value,
    userId: gate.userId,
    existingDraftId,
    salesLineId: gated.ctx?.salesLineId,
  });
  if (!generated.ok) {
    return jsonError(generated.error, 502);
  }

  return jsonOk({
    systemMessageId: generated.draftId,
    subject: generated.subject,
    introText: generated.introText,
    closingText: generated.closingText,
    fallback: generated.fallback,
  });
};
