import type { SupabaseClient } from '@supabase/supabase-js';
import { appendPresenceVisitToken } from '@/lib/presenceVisitToken';
import {
  buildOgrCollectionUrl,
  buildOgrProductUrl,
  resolvePublicSiteOrigin,
} from '@/lib/productUrls';
import { buildPublicProductPresentation } from '@/lib/publicProductPresentation';
import { renderOgrProductOutreachEmail } from '@/lib/ogrProductOutreachEmail';
import { sendOgrProductOutreachEmail } from '@/lib/sendOgrProductOutreachEmail';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';
import { replayUnmatchedResendEvents } from '@/lib/resendWebhook';
import {
  insertProductOutreachSendingMessage,
  markProductOutreachMessageFailed,
  stampProductOutreachMessageSent,
  stampResendEmailIdWithRetry,
  SYSTEM_MESSAGE_ORIGIN_MANUAL_PRODUCT_EMAIL,
} from '@/lib/systemMessages';
import type { Database } from '@/types/database';
import type { PublicOgrProduct } from '@/lib/publicCatalog';
import type { PublicMarket } from '@/lib/pricingMarket';

type DbClient = SupabaseClient<Database>;

export type SiblingProductOutreachSendInput = {
  client: DbClient;
  emails: readonly string[];
  product: PublicOgrProduct;
  presentation: ReturnType<typeof buildPublicProductPresentation>;
  emailMarket: PublicMarket;
  requestOrigin: string;
  toName: string | null;
  subject: string;
  introText: string;
  closingText: string;
  signatureName: string;
  fromDisplayName: string;
  prospectId: number | null;
  accountContactId: string | null;
  retailerLineAccountId: string | null;
  sentBy: string;
};

/**
 * Best-effort second (and later) Resend + ledger rows for Primary alternate email.
 * Failures are logged per row and do not throw.
 */
export async function sendSiblingProductOutreachEmails(
  input: SiblingProductOutreachSendInput,
): Promise<void> {
  if (input.emails.length === 0) return;

  const origin = resolvePublicSiteOrigin({ requestOrigin: input.requestOrigin });
  const baseProductHref =
    input.emailMarket === 'us'
      ? buildOgrProductUrl(input.presentation.slug, origin, 'us')
      : buildOgrProductUrl(input.presentation.slug, origin);
  const baseCatalogHref =
    input.emailMarket === 'us'
      ? buildOgrCollectionUrl(origin, 'us')
      : buildOgrCollectionUrl(origin);

  for (const toEmail of input.emails) {
    const ledger = await insertProductOutreachSendingMessage(input.client, {
      catalogItemId: input.product.id,
      toEmail,
      toName: input.toName,
      subject: input.subject,
      prospectId: input.prospectId,
      accountContactId: input.accountContactId,
      retailerLineAccountId: input.retailerLineAccountId,
      sentBy: input.sentBy,
      payload: {
        sku: input.product.sku,
        name: input.product.name,
        slug: input.presentation.slug,
        productHref: baseProductHref,
        ...(input.emailMarket === 'us' ? { publicMarket: 'us' as const } : {}),
      },
    });

    if (!ledger.ok) {
      console.error('[ogrProductOutreachEmail]', {
        workflow: 'sibling_system_message_preinsert',
        toEmail,
        error: ledger.error,
      });
      continue;
    }

    let productHref = baseProductHref;
    let catalogHref = baseCatalogHref;
    if (input.prospectId != null) {
      productHref = appendPresenceVisitToken(productHref, {
        prospectId: input.prospectId,
        systemMessageId: ledger.id,
      });
      catalogHref = appendPresenceVisitToken(catalogHref, {
        prospectId: input.prospectId,
        systemMessageId: ledger.id,
      });
      const { error: stampedPayloadError } = await input.client
        .from('system_messages')
        .update({
          payload: {
            sku: input.product.sku,
            name: input.product.name,
            slug: input.presentation.slug,
            productHref,
            ...(input.emailMarket === 'us' ? { publicMarket: 'us' as const } : {}),
          },
        })
        .eq('id', ledger.id)
        .eq('origin', SYSTEM_MESSAGE_ORIGIN_MANUAL_PRODUCT_EMAIL)
        .eq('status', 'sending');
      if (stampedPayloadError) {
        console.error('[ogrProductOutreachEmail]', {
          workflow: 'sibling_stamp_presence_href',
          systemMessageId: ledger.id,
          error: stampedPayloadError.message,
        });
      }
    }

    const message = renderOgrProductOutreachEmail({
      presentation: input.presentation,
      productHref,
      catalogHref,
      signatureName: input.signatureName,
      recipientName: input.toName,
      subject: input.subject,
      introText: input.introText,
      closingText: input.closingText,
    });

    const sendResult = await sendOgrProductOutreachEmail({
      to: toEmail,
      subject: message.subject,
      html: message.html,
      text: message.text,
      fromDisplayName: input.fromDisplayName,
    });

    if (!sendResult.ok) {
      await markProductOutreachMessageFailed(
        input.client,
        ledger.id,
        sendResult.error ?? sendResult.reason,
      );
      console.error('[ogrProductOutreachEmail]', {
        workflow: 'sibling_staff_send',
        systemMessageId: ledger.id,
        toEmail,
        reason: sendResult.reason,
        error: sendResult.error,
      });
      continue;
    }

    const persist = await stampResendEmailIdWithRetry(() =>
      stampProductOutreachMessageSent(input.client, ledger.id, {
        resendEmailId: sendResult.resendEmailId,
      }),
    );

    if (!persist.ok) {
      console.error('[ogrProductOutreachEmail]', {
        workflow: 'sibling_system_message_stamp',
        systemMessageId: ledger.id,
        resendEmailId: sendResult.resendEmailId,
        error: persist.error,
      });
      continue;
    }

    const admin = getServiceRoleClient();
    if (admin) {
      await replayUnmatchedResendEvents(admin, sendResult.resendEmailId);
    }
  }
}
