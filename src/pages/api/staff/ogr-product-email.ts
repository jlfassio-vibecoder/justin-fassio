import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { CONTACT_EMAIL } from '@/data/landing';
import { loadPublishedOgrProductForEmail } from '@/lib/loadPublishedOgrProductForEmail';
import {
  isValidOgrProductEmailRecipient,
  OGR_PRODUCT_EMAIL_MAX_PROSE,
  OGR_PRODUCT_EMAIL_MAX_RECIPIENT_NAME,
  OGR_PRODUCT_EMAIL_MAX_SUBJECT,
} from '@/lib/ogrProductEmailLimits';
import { renderOgrProductOutreachEmail } from '@/lib/ogrProductOutreachEmail';
import { resolveStaffOutreachSenderNames } from '@/lib/ogrProductEmailSender';
import {
  buildOgrCollectionUrl,
  buildOgrProductUrl,
  resolvePublicSiteOrigin,
} from '@/lib/productUrls';
import { buildPublicProductPresentation } from '@/lib/publicProductPresentation';
import { sendOgrProductOutreachEmail } from '@/lib/sendOgrProductOutreachEmail';
import { resolvePricingMarketForRetailerLineAccount } from '@/lib/resolveAccountPricingMarket';
import { normalizePublicMarket, type PublicMarket } from '@/lib/pricingMarket';
import {
  insertProductOutreachSystemMessage,
  resolveProductOutreachCrmAssociation,
  validateProductOutreachRetailerLineAccount,
} from '@/lib/systemMessages';

export const prerender = false;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function optionalBoundedString(
  value: unknown,
  max: number,
  label: string,
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: undefined };
  if (typeof value !== 'string') {
    return { ok: false, error: `${label} must be a string` };
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    return { ok: false, error: `${label} is too long` };
  }
  return { ok: true, value: trimmed || undefined };
}

function parseOptionalProspectId(
  value: unknown,
): { ok: true; value: number | undefined } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: undefined };
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return { ok: true, value };
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed > 0) return { ok: true, value: parsed };
  }
  return { ok: false, error: 'prospectId must be a positive integer' };
}

function parseOptionalUuid(
  value: unknown,
  label: string,
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: undefined };
  if (typeof value !== 'string') {
    return { ok: false, error: `${label} must be a string` };
  }
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: undefined };
  if (!UUID_RE.test(trimmed)) {
    return { ok: false, error: `${label} must be a valid UUID` };
  }
  return { ok: true, value: trimmed };
}

function parseOptionalAccountContactId(
  value: unknown,
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  return parseOptionalUuid(value, 'accountContactId');
}

function parseOptionalPublicMarket(
  value: unknown,
): { ok: true; value: PublicMarket | undefined } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: undefined };
  if (typeof value !== 'string') {
    return { ok: false, error: 'market must be ca or us' };
  }
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: undefined };
  const normalized = normalizePublicMarket(trimmed);
  if (!normalized) {
    return { ok: false, error: 'market must be ca or us' };
  }
  return { ok: true, value: normalized };
}

export const POST: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  let body: {
    productId?: unknown;
    to?: unknown;
    recipientName?: unknown;
    subject?: unknown;
    introText?: unknown;
    closingText?: unknown;
    prospectId?: unknown;
    accountContactId?: unknown;
    salesLineId?: unknown;
    retailerLineAccountId?: unknown;
    html?: unknown;
    from?: unknown;
    signatureName?: unknown;
    productHref?: unknown;
    market?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  if (
    body.html != null ||
    body.from != null ||
    body.signatureName != null ||
    body.productHref != null
  ) {
    return jsonError('Unsupported fields in request', 400);
  }

  const productId = typeof body.productId === 'string' ? body.productId.trim() : '';
  if (!productId || !UUID_RE.test(productId)) {
    return jsonError('A valid productId is required', 400);
  }

  const to = typeof body.to === 'string' ? body.to.trim() : '';
  if (!isValidOgrProductEmailRecipient(to)) {
    return jsonError('A valid recipient email is required', 400);
  }

  const recipientNameResult = optionalBoundedString(
    body.recipientName,
    OGR_PRODUCT_EMAIL_MAX_RECIPIENT_NAME,
    'recipientName',
  );
  if (!recipientNameResult.ok) return jsonError(recipientNameResult.error, 400);

  const subjectResult = optionalBoundedString(
    body.subject,
    OGR_PRODUCT_EMAIL_MAX_SUBJECT,
    'subject',
  );
  if (!subjectResult.ok) return jsonError(subjectResult.error, 400);

  const introResult = optionalBoundedString(
    body.introText,
    OGR_PRODUCT_EMAIL_MAX_PROSE,
    'introText',
  );
  if (!introResult.ok) return jsonError(introResult.error, 400);

  const closingResult = optionalBoundedString(
    body.closingText,
    OGR_PRODUCT_EMAIL_MAX_PROSE,
    'closingText',
  );
  if (!closingResult.ok) return jsonError(closingResult.error, 400);

  const prospectIdResult = parseOptionalProspectId(body.prospectId);
  if (!prospectIdResult.ok) return jsonError(prospectIdResult.error, 400);

  const accountContactIdResult = parseOptionalAccountContactId(body.accountContactId);
  if (!accountContactIdResult.ok) return jsonError(accountContactIdResult.error, 400);

  const salesLineIdResult = parseOptionalUuid(body.salesLineId, 'salesLineId');
  if (!salesLineIdResult.ok) return jsonError(salesLineIdResult.error, 400);

  const retailerLineAccountIdResult = parseOptionalUuid(
    body.retailerLineAccountId,
    'retailerLineAccountId',
  );
  if (!retailerLineAccountIdResult.ok) return jsonError(retailerLineAccountIdResult.error, 400);

  const marketResult = parseOptionalPublicMarket(body.market);
  if (!marketResult.ok) return jsonError(marketResult.error, 400);

  const loaded = await loadPublishedOgrProductForEmail(
    gate.supabase,
    productId,
    salesLineIdResult.value ? { salesLineId: salesLineIdResult.value } : undefined,
  );
  if (!loaded.ok) {
    return jsonError(loaded.message, 404);
  }

  let productHref: string;
  try {
    const crm = await resolveProductOutreachCrmAssociation(gate.supabase, {
      prospectId: prospectIdResult.value,
      accountContactId: accountContactIdResult.value,
      toEmail: to,
    });
    if (!crm.ok) {
      return jsonError(crm.error, 400);
    }

    let retailerLineAccountId: string | undefined;
    if (retailerLineAccountIdResult.value) {
      if (!salesLineIdResult.value) {
        return jsonError('salesLineId is required when retailerLineAccountId is provided', 400);
      }
      if (crm.association.prospectId == null) {
        return jsonError('prospectId is required when retailerLineAccountId is provided', 400);
      }
      const rla = await validateProductOutreachRetailerLineAccount(gate.supabase, {
        retailerLineAccountId: retailerLineAccountIdResult.value,
        prospectId: crm.association.prospectId,
        salesLineId: salesLineIdResult.value,
      });
      if (!rla.ok) {
        return jsonError(rla.error, 400);
      }
      retailerLineAccountId = rla.retailerLineAccountId;
    }

    const emailMarket = retailerLineAccountId
      ? (await resolvePricingMarketForRetailerLineAccount(gate.supabase, retailerLineAccountId))
          .publicMarket
      : (marketResult.value ?? 'ca');
    const presentation = buildPublicProductPresentation(loaded.product, {
      publicMarket: emailMarket,
    });
    const origin = resolvePublicSiteOrigin({
      requestOrigin: new URL(request.url).origin,
    });
    productHref =
      emailMarket === 'us'
        ? buildOgrProductUrl(presentation.slug, origin, 'us')
        : buildOgrProductUrl(presentation.slug, origin);
    const catalogHref =
      emailMarket === 'us' ? buildOgrCollectionUrl(origin, 'us') : buildOgrCollectionUrl(origin);

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
      recipientName: recipientNameResult.value,
      subject: subjectResult.value,
      introText: introResult.value,
      closingText: closingResult.value,
    });

    const sendResult = await sendOgrProductOutreachEmail({
      to,
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
        workflow: 'staff_send',
        productId,
        reason: sendResult.reason,
        error: sendResult.error,
      });
      // Surface domain verification clearly; keep other provider detail server-only.
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

    const persist = await insertProductOutreachSystemMessage(gate.supabase, {
      catalogItemId: productId,
      resendEmailId: sendResult.resendEmailId,
      toEmail: to,
      toName: recipientNameResult.value,
      subject: message.subject,
      prospectId: crm.association.prospectId,
      accountContactId: crm.association.accountContactId,
      retailerLineAccountId: retailerLineAccountId ?? null,
      sentBy: gate.userId,
      payload: {
        sku: loaded.product.sku,
        name: loaded.product.name,
        slug: presentation.slug,
        productHref,
        ...(emailMarket === 'us' ? { publicMarket: 'us' as const } : {}),
      },
    });

    if (!persist.ok) {
      console.error('[ogrProductOutreachEmail]', {
        workflow: 'system_message_persist',
        productId,
        resendEmailId: sendResult.resendEmailId,
        error: persist.error,
      });
      return new Response(
        JSON.stringify({
          ok: true,
          resendEmailId: sendResult.resendEmailId,
          logged: false,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        systemMessageId: persist.id,
        resendEmailId: sendResult.resendEmailId,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ogrProductOutreachEmail]', {
      workflow: 'staff_send',
      productId,
      error: message,
    });
    if (/origin|slug|URL|url/i.test(message)) {
      return jsonError('Invalid public product URL', 400);
    }
    return jsonError('Failed to send email', 502);
  }
};
