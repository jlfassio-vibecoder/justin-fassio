import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { loadPublishedOgrProductForEmail } from '@/lib/loadPublishedOgrProductForEmail';
import {
  DRAFT_FIELD_LIMITS,
  jsonError,
  jsonOk,
  optionalBoundedString,
  rejectUnsupportedSendFields,
  requireAccountContactId,
  requireBoundedString,
  requireProductId,
  requireProspectId,
  requireRecipientEmail,
  serializeAgentDraft,
} from '@/lib/ogrProductEmailDraftApi';
import {
  defaultOgrProductEmailSubject,
  OGR_PRODUCT_EMAIL_DEFAULT_CLOSING,
  OGR_PRODUCT_EMAIL_DEFAULT_INTRO,
} from '@/lib/ogrProductOutreachEmail';
import { buildOgrProductUrl, resolvePublicSiteOrigin } from '@/lib/productUrls';
import { buildPublicProductPresentation } from '@/lib/publicProductPresentation';
import {
  insertAgentProductOutreachDraft,
  listAgentProductOutreachDrafts,
  requireExplicitProductOutreachCrmAssociation,
} from '@/lib/systemMessages';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const catalogItemId = url.searchParams.get('catalogItemId')?.trim() || undefined;
  const prospectRaw = url.searchParams.get('prospectId');
  const status = url.searchParams.get('status')?.trim() || 'draft';

  let prospectId: number | undefined;
  if (prospectRaw != null && prospectRaw !== '') {
    const parsed = requireProspectId(prospectRaw);
    if (!parsed.ok) return jsonError(parsed.error, 400);
    prospectId = parsed.value;
  }

  if (!catalogItemId && prospectId == null) {
    const scope = url.searchParams.get('scope')?.trim();
    if (scope === 'prep') {
      const automationRunId = url.searchParams.get('automationRunId')?.trim() || undefined;
      const preparationDate = url.searchParams.get('preparationDate')?.trim() || undefined;
      const listed = await listAgentProductOutreachDrafts(gate.supabase, {
        statuses: status.includes(',')
          ? status
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
        status: status.includes(',') ? undefined : status,
        automationRunId,
        preparationDate,
        prepScope: true,
        limit: 25,
      });
      if (!listed.ok) return jsonError(listed.error, 500);
      return jsonOk({ drafts: listed.drafts.map(serializeAgentDraft) });
    }
    return jsonError('catalogItemId or prospectId is required', 400);
  }

  const listed = await listAgentProductOutreachDrafts(gate.supabase, {
    catalogItemId,
    prospectId,
    status,
  });
  if (!listed.ok) return jsonError(listed.error, 500);

  return jsonOk({ drafts: listed.drafts.map(serializeAgentDraft) });
};

export const POST: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const unsupported = rejectUnsupportedSendFields(body);
  if (unsupported) return jsonError(unsupported, 400);

  const productId = requireProductId(body.productId);
  if (!productId.ok) return jsonError(productId.error, 400);

  const to = requireRecipientEmail(body.to);
  if (!to.ok) return jsonError(to.error, 400);

  const toName = requireBoundedString(
    body.toName ?? body.recipientName,
    DRAFT_FIELD_LIMITS.toName,
    'toName',
  );
  if (!toName.ok) return jsonError(toName.error, 400);

  const prospectId = requireProspectId(body.prospectId);
  if (!prospectId.ok) return jsonError(prospectId.error, 400);

  const accountContactId = requireAccountContactId(body.accountContactId);
  if (!accountContactId.ok) return jsonError(accountContactId.error, 400);

  const subjectResult = optionalBoundedString(body.subject, DRAFT_FIELD_LIMITS.subject, 'subject');
  if (!subjectResult.ok) return jsonError(subjectResult.error, 400);

  const introResult = optionalBoundedString(body.introText, DRAFT_FIELD_LIMITS.prose, 'introText');
  if (!introResult.ok) return jsonError(introResult.error, 400);

  const closingResult = optionalBoundedString(
    body.closingText,
    DRAFT_FIELD_LIMITS.prose,
    'closingText',
  );
  if (!closingResult.ok) return jsonError(closingResult.error, 400);

  const crm = await requireExplicitProductOutreachCrmAssociation(gate.supabase, {
    prospectId: prospectId.value,
    accountContactId: accountContactId.value,
  });
  if (!crm.ok) return jsonError(crm.error, 400);

  const loaded = await loadPublishedOgrProductForEmail(gate.supabase, productId.value);
  if (!loaded.ok) {
    return jsonError(loaded.message, 404);
  }

  const presentation = buildPublicProductPresentation(loaded.product);
  const origin = resolvePublicSiteOrigin({
    requestOrigin: new URL(request.url).origin,
  });
  const productHref = buildOgrProductUrl(presentation.slug, origin);

  const subject = subjectResult.value ?? defaultOgrProductEmailSubject(presentation.name);
  const introText = introResult.value ?? OGR_PRODUCT_EMAIL_DEFAULT_INTRO;
  const closingText = closingResult.value ?? OGR_PRODUCT_EMAIL_DEFAULT_CLOSING;

  const inserted = await insertAgentProductOutreachDraft(gate.supabase, {
    catalogItemId: productId.value,
    toEmail: to.value,
    toName: toName.value,
    subject,
    introText,
    closingText,
    prospectId: crm.association.prospectId,
    accountContactId: crm.association.accountContactId,
    sentBy: gate.userId,
    payload: {
      sku: presentation.sku,
      name: presentation.name,
      slug: presentation.slug,
      productHref,
    },
  });

  if (!inserted.ok) {
    return jsonError(inserted.error, 500);
  }

  return jsonOk({ systemMessageId: inserted.id }, 201);
};
