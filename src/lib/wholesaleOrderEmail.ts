import { Resend } from 'resend';
import { CONTACT_EMAIL } from '@/data/landing';

export type WholesaleOrderEmailLine = {
  sku: string;
  name: string;
  size: string;
  quantity: number;
  wholesaleUsd: number;
};

export type WholesaleOrderEmailPayload = {
  requestNumber: string;
  buyerName: string;
  buyerEmail: string;
  businessName: string;
  totalUnits: number;
  merchandiseSubtotalUsd: number;
  lines: WholesaleOrderEmailLine[];
  requestType?: 'order' | 'inquiry';
  notes?: string | null;
};

export type WholesaleOrderEmailResult =
  { sent: true } | { sent: false; reason: 'not_configured' | 'send_failed'; error?: string };

function lineRowsHtml(lines: WholesaleOrderEmailLine[]): string {
  return lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.sku)}</td><td>${escapeHtml(l.name)}</td><td>${escapeHtml(l.size)}</td>` +
        `<td>${l.quantity}</td><td>US$${l.wholesaleUsd.toFixed(2)}</td></tr>`,
    )
    .join('');
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function buildOrderHtml(payload: WholesaleOrderEmailPayload): string {
  return `
<p>Hi ${escapeHtml(payload.buyerName)},</p>
<p>We received your Old Guys Rule wholesale order request
<strong>${escapeHtml(payload.requestNumber)}</strong> for
${escapeHtml(payload.businessName)}.</p>
<p>${payload.totalUnits} units · merchandise subtotal
<strong>US$${payload.merchandiseSubtotalUsd.toFixed(2)}</strong></p>
<table border="1" cellpadding="6" cellspacing="0">
<thead><tr><th>SKU</th><th>Product</th><th>Size</th><th>Qty</th><th>Wholesale</th></tr></thead>
<tbody>${lineRowsHtml(payload.lines)}</tbody>
</table>
<p>This is an order request, not a completed purchase. We will confirm pricing,
availability, freight, duties and payment terms before acceptance.</p>
<p>— Justin Fassio</p>
`.trim();
}

function buildInquiryHtml(payload: WholesaleOrderEmailPayload): string {
  const notes = payload.notes?.trim();
  return `
<p>Hi ${escapeHtml(payload.buyerName)},</p>
<p>Thanks for reaching out about Old Guys Rule wholesale for
${escapeHtml(payload.businessName)}. Your inquiry reference is
<strong>${escapeHtml(payload.requestNumber)}</strong>.</p>
${notes ? `<p>${escapeHtml(notes)}</p>` : ''}
<p>Justin will follow up by email with next steps.</p>
<p>— Justin Fassio</p>
`.trim();
}

/**
 * Send buyer confirmation (+ office notify) when RESEND_API_KEY is configured.
 * Never throws; callers should ignore send failures after a successful DB insert.
 */
export async function sendWholesaleOrderConfirmation(
  payload: WholesaleOrderEmailPayload,
  env: { apiKey?: string | null; from?: string | null } = {},
): Promise<WholesaleOrderEmailResult> {
  const apiKey = env.apiKey ?? import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 're_xxxxxxxxx') {
    return { sent: false, reason: 'not_configured' };
  }

  const from =
    env.from ??
    import.meta.env.WHOLESALE_ORDER_EMAIL_FROM ??
    process.env.WHOLESALE_ORDER_EMAIL_FROM ??
    `Justin Fassio <${CONTACT_EMAIL}>`;

  const isInquiry = payload.requestType === 'inquiry';
  const html = isInquiry ? buildInquiryHtml(payload) : buildOrderHtml(payload);
  const subject = isInquiry
    ? `Wholesale inquiry ${payload.requestNumber}`
    : `Wholesale order request ${payload.requestNumber}`;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: payload.buyerEmail,
      cc: CONTACT_EMAIL,
      subject,
      html,
    });
    if (error) {
      console.error('[wholesaleOrderEmail]', error);
      return { sent: false, reason: 'send_failed', error: error.message };
    }
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email error';
    console.error('[wholesaleOrderEmail]', message);
    return { sent: false, reason: 'send_failed', error: message };
  }
}
