import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { CONTACT_EMAIL } from '@/data/landing';
import { loadPublishedOgrProductForEmail } from '@/lib/loadPublishedOgrProductForEmail';
import {
  jsonError,
  jsonOk,
  rejectUnsupportedSendFields,
  requireDraftId,
} from '@/lib/ogrProductEmailDraftApi';
import { renderOgrProductOutreachEmail } from '@/lib/ogrProductOutreachEmail';
import { resolveStaffOutreachSenderNames } from '@/lib/ogrProductEmailSender';
import {
  buildOgrCollectionUrl,
  buildOgrProductUrl,
  resolvePublicSiteOrigin,
} from '@/lib/productUrls';
import { appendPresenceVisitToken } from '@/lib/presenceVisitToken';
import { buildPublicProductPresentation } from '@/lib/publicProductPresentation';
import { resolveOgrPricingMarketForProductEmailDraft } from '@/lib/resolveAccountPricingMarket';
import { sendOgrProductOutreachEmail } from '@/lib/sendOgrProductOutreachEmail';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';
import { replayUnmatchedResendEvents } from '@/lib/resendWebhook';
import { fetchAccountContactById } from '@/lib/accountContacts';
import { resolveProductOutreachSendEmails } from '@/lib/resolveProductOutreachSendEmails';
import { sendSiblingProductOutreachEmails } from '@/lib/sendSiblingProductOutreachEmails';
import {
  getAgentProductOutreachDraftById,
  markAgentProductOutreachDraftSent,
  publicMarketFromOutreachPayload,
  requireExplicitProductOutreachCrmAssociation,
  stampAgentProductOutreachDraftResendId,
  stampResendEmailIdWithRetry,
} from '@/lib/systemMessages';

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const id = requireDraftId(params.id);
  if (!id.ok) return jsonError(id.error, 400);

  if (request.headers.get('content-type')?.includes('application/json')) {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      const unsupported = rejectUnsupportedSendFields(body);
      if (unsupported) return jsonError(unsupported, 400);
    } catch {
      return jsonError('Invalid JSON body', 400);
    }
  }

  const loadedDraft = await getAgentProductOutreachDraftById(gate.supabase, id.value);
  if (!loadedDraft.ok) {
    const status = loadedDraft.error === 'Draft not found' ? 404 : 400;
    return jsonError(loadedDraft.error, status);
  }

  const draft = loadedDraft.draft;
  if (draft.status !== 'draft') {
    return jsonError('Only draft messages can be sent', 409);
  }

  const crm = await requireExplicitProductOutreachCrmAssociation(gate.supabase, {
    prospectId: draft.prospectId,
    accountContactId: draft.accountContactId,
  });
  if (!crm.ok) return jsonError(crm.error, 400);

  let sendContact = null;
  if (crm.association.accountContactId) {
    const loadedContact = await fetchAccountContactById(
      gate.supabase,
      crm.association.accountContactId,
    );
    if (loadedContact.error) {
      return jsonError(loadedContact.error, 500);
    }
    sendContact = loadedContact.data;
  }
  const recipients = resolveProductOutreachSendEmails(sendContact, draft.toEmail);
  const siblingEmails = recipients.filter(
    (email) => email.toLowerCase() !== draft.toEmail.trim().toLowerCase(),
  );

  const loaded = await loadPublishedOgrProductForEmail(gate.supabase, draft.catalogItemId);
  if (!loaded.ok) {
    return jsonError(loaded.message, 404);
  }

  let productHref: string;
  let catalogHref: string;
  try {
    const origin = resolvePublicSiteOrigin({
      requestOrigin: new URL(request.url).origin,
    });
    const emailMarket = (
      await resolveOgrPricingMarketForProductEmailDraft(gate.supabase, {
        prospectId: crm.association.prospectId,
        retailerLineAccountId: draft.retailerLineAccountId,
        payloadMarket: publicMarketFromOutreachPayload(draft.payload),
      })
    ).publicMarket;
    const presentation = buildPublicProductPresentation(loaded.product, {
      publicMarket: emailMarket,
    });
    productHref =
      emailMarket === 'us'
        ? buildOgrProductUrl(presentation.slug, origin, 'us')
        : buildOgrProductUrl(presentation.slug, origin);
    catalogHref =
      emailMarket === 'us' ? buildOgrCollectionUrl(origin, 'us') : buildOgrCollectionUrl(origin);
    productHref = appendPresenceVisitToken(productHref, {
      prospectId: crm.association.prospectId,
      systemMessageId: draft.id,
    });
    catalogHref = appendPresenceVisitToken(catalogHref, {
      prospectId: crm.association.prospectId,
      systemMessageId: draft.id,
    });

    const [{ data: profile }, { data: userData }] = await Promise.all([
      gate.supabase
        .from('profiles')
        .select('display_name, email')
        .eq('id', gate.userId)
        .maybeSingle(),
      gate.supabase.auth.getUser(),
    ]);

    const metadata = userData.user?.user_metadata ?? {};
    const sender = resolveStaffOutreachSenderNames({
      displayName: typeof profile?.display_name === 'string' ? profile.display_name : null,
      additionalNames: [
        typeof metadata.full_name === 'string' ? metadata.full_name : null,
        typeof metadata.name === 'string' ? metadata.name : null,
        typeof metadata.display_name === 'string' ? metadata.display_name : null,
      ],
      emails: [profile?.email, userData.user?.email, CONTACT_EMAIL],
    });

    const message = renderOgrProductOutreachEmail({
      presentation,
      productHref,
      catalogHref,
      signatureName: sender.signatureName,
      recipientName: draft.toName,
      subject: draft.subject,
      introText: draft.introText,
      closingText: draft.closingText,
      wholesaleUsd: loaded.wholesaleUsd,
    });

    const sendResult = await sendOgrProductOutreachEmail({
      to: draft.toEmail,
      subject: message.subject,
      html: message.html,
      text: message.text,
      fromDisplayName: sender.fromDisplayName,
    });

    if (!sendResult.ok) {
      if (sendResult.reason === 'not_configured') {
        return jsonError('Email is not configured', 503);
      }
      console.error('[ogrProductOutreachEmail]', {
        workflow: 'staff_send_draft',
        systemMessageId: draft.id,
        productId: draft.catalogItemId,
        reason: sendResult.reason,
        error: sendResult.error,
      });
      const providerMessage = sendResult.error ?? '';
      if (/domain is not verified/i.test(providerMessage)) {
        return jsonError(
          'Email sender domain is not verified in Resend. Verify justinfassio.com at resend.com/domains.',
          502,
        );
      }
      if (/only send testing emails to your own email/i.test(providerMessage)) {
        return jsonError(
          'Resend test mode can only send to the account owner email until a domain is verified.',
          502,
        );
      }
      return jsonError('Failed to send email', 502);
    }

    const persist = await stampResendEmailIdWithRetry(async () => {
      const primary = await markAgentProductOutreachDraftSent(gate.supabase, draft.id, {
        resendEmailId: sendResult.resendEmailId,
        sentBy: gate.userId,
        payload: {
          sku: loaded.product.sku,
          name: loaded.product.name,
          slug: presentation.slug,
          productHref,
          from: undefined,
          ...(emailMarket === 'us' ? { publicMarket: 'us' as const } : {}),
        },
      });
      if (primary.ok) return primary;
      return stampAgentProductOutreachDraftResendId(gate.supabase, draft.id, {
        resendEmailId: sendResult.resendEmailId,
        sentBy: gate.userId,
        payload: {
          sku: loaded.product.sku,
          name: loaded.product.name,
          slug: presentation.slug,
          productHref,
          from: undefined,
          ...(emailMarket === 'us' ? { publicMarket: 'us' as const } : {}),
        },
      });
    });

    if (!persist.ok) {
      console.error('[ogrProductOutreachEmail]', {
        workflow: 'system_message_draft_persist',
        systemMessageId: draft.id,
        productId: draft.catalogItemId,
        resendEmailId: sendResult.resendEmailId,
        error: persist.error,
      });
      if (siblingEmails.length > 0) {
        await sendSiblingProductOutreachEmails({
          client: gate.supabase,
          emails: siblingEmails,
          product: loaded.product,
          presentation,
          emailMarket,
          requestOrigin: new URL(request.url).origin,
          toName: draft.toName,
          subject: draft.subject,
          introText: draft.introText,
          closingText: draft.closingText,
          signatureName: sender.signatureName,
          fromDisplayName: sender.fromDisplayName,
          prospectId: crm.association.prospectId,
          accountContactId: crm.association.accountContactId,
          retailerLineAccountId: draft.retailerLineAccountId,
          sentBy: gate.userId,
          wholesaleUsd: loaded.wholesaleUsd,
        });
      }
      return jsonOk({
        systemMessageId: draft.id,
        resendEmailId: sendResult.resendEmailId,
        logged: false,
      });
    }

    const admin = getServiceRoleClient();
    if (admin) {
      await replayUnmatchedResendEvents(admin, sendResult.resendEmailId);
    }

    if (siblingEmails.length > 0) {
      await sendSiblingProductOutreachEmails({
        client: gate.supabase,
        emails: siblingEmails,
        product: loaded.product,
        presentation,
        emailMarket,
        requestOrigin: new URL(request.url).origin,
        toName: draft.toName,
        subject: draft.subject,
        introText: draft.introText,
        closingText: draft.closingText,
        signatureName: sender.signatureName,
        fromDisplayName: sender.fromDisplayName,
        prospectId: crm.association.prospectId,
        accountContactId: crm.association.accountContactId,
        retailerLineAccountId: draft.retailerLineAccountId,
        sentBy: gate.userId,
        wholesaleUsd: loaded.wholesaleUsd,
      });
    }

    return jsonOk({
      systemMessageId: persist.id,
      resendEmailId: sendResult.resendEmailId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send draft';
    console.error('[ogrProductOutreachEmail]', {
      workflow: 'staff_send_draft',
      systemMessageId: draft.id,
      error: message,
    });
    return jsonError(message, 500);
  }
};
