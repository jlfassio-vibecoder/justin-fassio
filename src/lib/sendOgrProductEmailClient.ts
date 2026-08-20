import { supabase } from '@/lib/supabase';
import type { PublicMarket } from '@/lib/pricingMarket';

export type SendOgrProductEmailInput = {
  productId: string;
  to: string;
  recipientName?: string;
  subject?: string;
  introText?: string;
  closingText?: string;
  prospectId?: number;
  accountContactId?: string;
  salesLineId?: string;
  retailerLineAccountId?: string;
  market?: PublicMarket;
};

export type SendOgrProductEmailResult =
  | { ok: true; systemMessageId?: string; resendEmailId?: string; logged?: boolean }
  | { ok: false; error: string };

/**
 * Client call to POST /api/staff/ogr-product-email with the current session Bearer token.
 * Sends only staff-editable fields — never html, from, signature, or presentation.
 */
export async function sendOgrProductEmail(
  input: SendOgrProductEmailInput,
): Promise<SendOgrProductEmailResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    return { ok: false, error: 'Not signed in' };
  }

  const body: Record<string, string | number> = {
    productId: input.productId,
    to: input.to,
  };
  if (input.recipientName != null && input.recipientName.trim()) {
    body.recipientName = input.recipientName.trim();
  }
  if (input.subject != null && input.subject.trim()) {
    body.subject = input.subject.trim();
  }
  if (input.introText != null && input.introText.trim()) {
    body.introText = input.introText.trim();
  }
  if (input.closingText != null && input.closingText.trim()) {
    body.closingText = input.closingText.trim();
  }
  if (input.prospectId != null) {
    body.prospectId = input.prospectId;
  }
  if (input.accountContactId != null && input.accountContactId.trim()) {
    body.accountContactId = input.accountContactId.trim();
  }
  if (input.salesLineId != null && input.salesLineId.trim()) {
    body.salesLineId = input.salesLineId.trim();
  }
  if (input.retailerLineAccountId != null && input.retailerLineAccountId.trim()) {
    body.retailerLineAccountId = input.retailerLineAccountId.trim();
  }
  if (input.market != null) {
    body.market = input.market;
  }

  const res = await fetch('/api/staff/ogr-product-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  let payload: {
    ok?: boolean;
    error?: string;
    systemMessageId?: string;
    resendEmailId?: string;
    logged?: boolean;
  } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    return { ok: false, error: `Send failed (${res.status})` };
  }

  if (!res.ok || !payload.ok) {
    return { ok: false, error: payload.error || `Send failed (${res.status})` };
  }

  return {
    ok: true,
    ...(typeof payload.systemMessageId === 'string'
      ? { systemMessageId: payload.systemMessageId }
      : {}),
    ...(typeof payload.resendEmailId === 'string' ? { resendEmailId: payload.resendEmailId } : {}),
    ...(payload.logged === false ? { logged: false } : {}),
  };
}
