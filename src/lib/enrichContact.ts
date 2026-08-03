import { supabase } from '@/lib/supabase';
import type { AccountContact } from '@/lib/accountContacts';
import type { CreateEnrichedContactMode } from '@/lib/createEnrichedContact';
import type { Prospect } from '@/lib/prospects';

export type EnrichContactResult =
  { ok: true; prospect: Prospect; contact: AccountContact } | { ok: false; error: string };

/**
 * Client call to POST /api/contacts/enrich with the current session Bearer token.
 */
export async function enrichContact(input: {
  contactName: string;
  companyName: string;
  phone?: string;
  email?: string;
  websiteUrl?: string;
  mode: CreateEnrichedContactMode;
  accountId?: number;
}): Promise<EnrichContactResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    return { ok: false, error: 'Not signed in' };
  }

  const res = await fetch('/api/contacts/enrich', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      contactName: input.contactName,
      companyName: input.companyName,
      phone: input.phone,
      email: input.email,
      websiteUrl: input.websiteUrl,
      mode: input.mode,
      accountId: input.accountId,
    }),
  });

  let payload: {
    ok?: boolean;
    prospect?: Prospect;
    contact?: AccountContact;
    error?: string;
  } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    return { ok: false, error: `Enrich failed (${res.status})` };
  }

  if (!res.ok || !payload.ok || !payload.prospect || !payload.contact) {
    return { ok: false, error: payload.error || `Enrich failed (${res.status})` };
  }

  return { ok: true, prospect: payload.prospect, contact: payload.contact };
}
