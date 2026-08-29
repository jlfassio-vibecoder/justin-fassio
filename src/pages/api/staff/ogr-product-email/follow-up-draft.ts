import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { checkAgentRateLimit, rateLimitResponse } from '@/lib/agentRateLimit';
import { hasAiGatewayAuth, LOCAL_AI_GATEWAY_AUTH_HELP } from '@/lib/aiGatewayEnv';
import { gateStaffAiContext, parseOptionalUuidField } from '@/lib/aiLineContext';
import { createOutreachFollowUpDraft } from '@/lib/createOutreachFollowUpDraft';
import { jsonError, jsonOk, rejectUnsupportedSendFields } from '@/lib/ogrProductEmailDraftApi';
import { getStaffFeatureFlags } from '@/lib/staffFeatures';
import {
  assertBigFishGenerateDraftAllowed,
  assertEaglePeakCatalogReadyForDraft,
  assertEaglePeakGenerateDraftAllowed,
  assertRepresentedLineOutreachAllowed,
} from '@/pages/api/staff/ogr-product-email/generate-draft';

export const prerender = false;

/**
 * Staff Briefing: reuse or generate a follow-up Product Outreach draft.
 * Body: { prospectId, salesLineId? }. Never calls Resend.
 */
export const POST: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const limited = checkAgentRateLimit(`follow-up-draft:${gate.userId}`);
  if (!limited.ok) {
    return rateLimitResponse(limited.retryAfterSec);
  }

  if (!hasAiGatewayAuth()) {
    return jsonError(LOCAL_AI_GATEWAY_AUTH_HELP, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const unsupported = rejectUnsupportedSendFields(body);
  if (unsupported) return jsonError(unsupported, 400);

  const prospectId = body.prospectId;
  if (typeof prospectId !== 'number' || !Number.isFinite(prospectId) || prospectId <= 0) {
    return jsonError('prospectId is required', 400);
  }

  const gated = await gateStaffAiContext({
    client: gate.supabase,
    salesLineId: parseOptionalUuidField(body.salesLineId),
    retailerLineAccountId: parseOptionalUuidField(body.retailerLineAccountId),
    prospectId,
    kind: 'line_level',
  });
  if (!gated.ok) {
    return jsonError(gated.error, gated.status);
  }
  if (gated.ctx?.mode === 'research_only') {
    return jsonError('Outreach generate is not available for this sales line', 403);
  }

  const representedOutreachGate = assertRepresentedLineOutreachAllowed({
    lineCode: gated.ctx?.code,
  });
  if (!representedOutreachGate.ok) {
    return jsonError(representedOutreachGate.error, representedOutreachGate.status);
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

  const created = await createOutreachFollowUpDraft({
    client: gate.supabase,
    prospectId,
    userId: gate.userId,
    salesLineId: gated.ctx?.salesLineId,
    retailerLineAccountId: gated.ctx?.retailerLineAccountId,
  });

  if (!created.ok) {
    if (created.status === 409 || created.status === 404 || created.status === 400) {
      return jsonError(created.error, created.status);
    }
    return jsonError(created.error, 502);
  }

  return jsonOk({
    systemMessageId: created.draftId,
    draftId: created.draftId,
    catalogItemId: created.catalogItemId,
    productName: created.productName,
    reusedPending: created.reusedPending,
  });
};
