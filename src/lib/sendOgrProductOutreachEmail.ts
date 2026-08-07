import { Resend } from 'resend';
import { CONTACT_EMAIL } from '@/data/landing';

export type SendOgrProductOutreachEmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendOgrProductOutreachEmailResult =
  { ok: true } | { ok: false; reason: 'not_configured' | 'send_failed'; error?: string };

/**
 * Transport-only Resend send for OGR product outreach.
 * Composer stays pure in `ogrProductOutreachEmail.ts`.
 */
export async function sendOgrProductOutreachEmail(
  payload: SendOgrProductOutreachEmailPayload,
  env: { apiKey?: string | null; from?: string | null } = {},
): Promise<SendOgrProductOutreachEmailResult> {
  const apiKey = env.apiKey ?? import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 're_xxxxxxxxx') {
    return { ok: false, reason: 'not_configured' };
  }

  const from =
    env.from ??
    import.meta.env.WHOLESALE_ORDER_EMAIL_FROM ??
    process.env.WHOLESALE_ORDER_EMAIL_FROM ??
    `Justin Fassio <${CONTACT_EMAIL}>`;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
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
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email error';
    console.error('[ogrProductOutreachEmail]', {
      workflow: 'resend_send',
      error: message,
    });
    return { ok: false, reason: 'send_failed', error: message };
  }
}
