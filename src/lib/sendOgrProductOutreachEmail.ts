import { Resend } from 'resend';
import { CONTACT_EMAIL } from '@/data/landing';
import {
  formatOutreachFromHeader,
  isUsableStaffDisplayName,
  OGR_PRODUCT_EMAIL_SENDER_FALLBACK,
} from '@/lib/ogrProductEmailSender';

export type SendOgrProductOutreachEmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * From header display name from the authenticated staff profile.
   * Address remains CONTACT_EMAIL (office@…). Never derived from the email local-part.
   */
  fromDisplayName?: string | null;
};

export type SendOgrProductOutreachEmailResult =
  | { ok: true; resendEmailId: string }
  | { ok: false; reason: 'not_configured' | 'send_failed'; error?: string };

/**
 * Transport-only Resend send for OGR product outreach.
 * Composer stays pure in `ogrProductOutreachEmail.ts`.
 *
 * `from` is always `Display Name <office@justinfassio.com>`.
 * WHOLESALE_ORDER_EMAIL_FROM / env.from are not used — a bare mailbox
 * (`office@…`) makes Resend show "office".
 */
export async function sendOgrProductOutreachEmail(
  payload: SendOgrProductOutreachEmailPayload,
  env: { apiKey?: string | null } = {},
): Promise<SendOgrProductOutreachEmailResult> {
  const apiKey = env.apiKey ?? import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 're_xxxxxxxxx') {
    return { ok: false, reason: 'not_configured' };
  }

  const fromDisplayName = isUsableStaffDisplayName(payload.fromDisplayName, [CONTACT_EMAIL])
    ? (payload.fromDisplayName ?? '').trim().replace(/\s+/g, ' ')
    : OGR_PRODUCT_EMAIL_SENDER_FALLBACK;
  const from = formatOutreachFromHeader(fromDisplayName, CONTACT_EMAIL);

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
    if (error) {
      console.error('[ogrProductOutreachEmail]', {
        workflow: 'resend_send',
        error: error.message,
      });
      return { ok: false, reason: 'send_failed', error: error.message };
    }
    const resendEmailId = typeof data?.id === 'string' ? data.id.trim() : '';
    if (!resendEmailId) {
      console.error('[ogrProductOutreachEmail]', {
        workflow: 'resend_send',
        error: 'Missing Resend email id',
      });
      return { ok: false, reason: 'send_failed', error: 'Missing Resend email id' };
    }
    return { ok: true, resendEmailId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email error';
    console.error('[ogrProductOutreachEmail]', {
      workflow: 'resend_send',
      error: message,
    });
    return { ok: false, reason: 'send_failed', error: message };
  }
}
