import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { parseOptionalUuidField } from '@/lib/aiLineContext';
import { loadPublishedOgrProductForEmail } from '@/lib/loadPublishedOgrProductForEmail';
import {
  DRAFT_FIELD_LIMITS,
  jsonError,
  jsonOk,
  optionalBoundedString,
  rejectUnsupportedSendFields,
  requireBoundedString,
  requireDraftId,
  requireProductId,
  requireRecipientEmail,
  serializeAgentDraft,
} from '@/lib/ogrProductEmailDraftApi';
import { defaultOgrProductEmailSubject } from '@/lib/ogrProductOutreachEmail';
import { buildOgrProductUrl, resolvePublicSiteOrigin } from '@/lib/productUrls';
import { buildPublicProductPresentation } from '@/lib/publicProductPresentation';
import { resolveOgrPricingMarketForProductEmailDraft } from '@/lib/resolveAccountPricingMarket';
import {
  getAgentProductOutreachDraftById,
  updateAgentProductOutreachDraft,
  type UpdateAgentProductOutreachDraftInput,
} from '@/lib/systemMessages';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const id = requireDraftId(params.id);
  if (!id.ok) return jsonError(id.error, 400);

  const loaded = await getAgentProductOutreachDraftById(gate.supabase, id.value);
  if (!loaded.ok) {
    const status = loaded.error === 'Draft not found' ? 404 : 400;
    return jsonError(loaded.error, status);
  }

  return jsonOk({ draft: serializeAgentDraft(loaded.draft) });
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const id = requireDraftId(params.id);
  if (!id.ok) return jsonError(id.error, 400);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const unsupported = rejectUnsupportedSendFields(body);
  if (unsupported) return jsonError(unsupported, 400);

  const patch: UpdateAgentProductOutreachDraftInput = {};

  if (body.to != null) {
    const to = requireRecipientEmail(body.to);
    if (!to.ok) return jsonError(to.error, 400);
    patch.toEmail = to.value;
  }

  if (body.toName != null || body.recipientName != null) {
    const toName = requireBoundedString(
      body.toName ?? body.recipientName,
      DRAFT_FIELD_LIMITS.toName,
      'toName',
    );
    if (!toName.ok) return jsonError(toName.error, 400);
    patch.toName = toName.value;
  }

  if (body.subject != null) {
    const subject = requireBoundedString(body.subject, DRAFT_FIELD_LIMITS.subject, 'subject');
    if (!subject.ok) return jsonError(subject.error, 400);
    patch.subject = subject.value;
  }

  if (body.introText != null) {
    const intro = optionalBoundedString(body.introText, DRAFT_FIELD_LIMITS.prose, 'introText');
    if (!intro.ok) return jsonError(intro.error, 400);
    if (intro.value == null) return jsonError('introText is required', 400);
    patch.introText = intro.value;
  }

  if (body.closingText != null) {
    const closing = optionalBoundedString(
      body.closingText,
      DRAFT_FIELD_LIMITS.prose,
      'closingText',
    );
    if (!closing.ok) return jsonError(closing.error, 400);
    if (closing.value == null) return jsonError('closingText is required', 400);
    patch.closingText = closing.value;
  }

  if (body.productId != null) {
    const productId = requireProductId(body.productId);
    if (!productId.ok) return jsonError(productId.error, 400);

    const existing = await getAgentProductOutreachDraftById(gate.supabase, id.value);
    if (!existing.ok) {
      const status = existing.error === 'Draft not found' ? 404 : 400;
      return jsonError(existing.error, status);
    }

    const salesLineId = parseOptionalUuidField(body.salesLineId);
    const loaded = await loadPublishedOgrProductForEmail(gate.supabase, productId.value, {
      ...(salesLineId ? { salesLineId } : {}),
    });
    if (!loaded.ok) {
      return jsonError(loaded.message, loaded.reason === 'not_available' ? 400 : 404);
    }

    const origin = resolvePublicSiteOrigin({
      requestOrigin: new URL(request.url).origin,
    });
    const emailMarket = (
      await resolveOgrPricingMarketForProductEmailDraft(gate.supabase, {
        prospectId: existing.draft.prospectId,
        retailerLineAccountId: existing.draft.retailerLineAccountId,
      })
    ).publicMarket;
    const presentation = buildPublicProductPresentation(loaded.product, {
      publicMarket: emailMarket,
    });
    const productHref =
      emailMarket === 'us'
        ? buildOgrProductUrl(presentation.slug, origin, 'us')
        : buildOgrProductUrl(presentation.slug, origin);

    patch.catalogItemId = productId.value;
    patch.subject = defaultOgrProductEmailSubject(presentation.name);
    patch.payload = {
      sku: presentation.sku,
      name: presentation.name,
      slug: presentation.slug,
      productHref,
      ...(emailMarket === 'us' ? { publicMarket: 'us' as const } : {}),
    };
  }

  if (Object.keys(patch).length === 0) {
    return jsonError('No fields to update', 400);
  }

  const updated = await updateAgentProductOutreachDraft(gate.supabase, id.value, patch);
  if (!updated.ok) {
    const status =
      updated.error === 'Draft not found' ? 404 : updated.error.includes('Only draft') ? 409 : 400;
    return jsonError(updated.error, status);
  }

  return jsonOk({ draft: serializeAgentDraft(updated.draft) });
};
