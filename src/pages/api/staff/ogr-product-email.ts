import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { loadPublishedOgrProductForEmail } from '@/lib/loadPublishedOgrProductForEmail';
import {
  isValidOgrProductEmailRecipient,
  OGR_PRODUCT_EMAIL_MAX_PROSE,
  OGR_PRODUCT_EMAIL_MAX_RECIPIENT_NAME,
  OGR_PRODUCT_EMAIL_MAX_SUBJECT,
} from '@/lib/ogrProductEmailLimits';
import { renderOgrProductOutreachEmail } from '@/lib/ogrProductOutreachEmail';
import { buildOgrProductUrl, resolvePublicSiteOrigin } from '@/lib/productUrls';
import { buildPublicProductPresentation } from '@/lib/publicProductPresentation';
import { sendOgrProductOutreachEmail } from '@/lib/sendOgrProductOutreachEmail';

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
    html?: unknown;
    from?: unknown;
    signatureName?: unknown;
    productHref?: unknown;
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

  const loaded = await loadPublishedOgrProductForEmail(gate.supabase, productId);
  if (!loaded.ok) {
    return jsonError(loaded.message, 404);
  }

  let productHref: string;
  try {
    const presentation = buildPublicProductPresentation(loaded.product);
    const origin = resolvePublicSiteOrigin({
      requestOrigin: new URL(request.url).origin,
    });
    productHref = buildOgrProductUrl(presentation.slug, origin);

    const { data: profile } = await gate.supabase
      .from('profiles')
      .select('display_name')
      .eq('id', gate.userId)
      .maybeSingle();

    const signatureName =
      typeof profile?.display_name === 'string' && profile.display_name.trim()
        ? profile.display_name.trim()
        : 'Justin Fassio';

    const message = renderOgrProductOutreachEmail({
      presentation,
      productHref,
      signatureName,
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

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
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
