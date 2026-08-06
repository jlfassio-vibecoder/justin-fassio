import { supabase } from '@/lib/supabase';
import type { Prospect } from '@/lib/prospects';

export type EnrichProspectInput = {
  companyName: string;
  websiteUrl?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  city?: string;
  retailChannelHint?: string;
  territoryCode?: string;
};

export type EnrichProspectResult = { ok: true; prospect: Prospect } | { ok: false; error: string };

/**
 * Client call to POST /api/prospects/enrich with the current session Bearer token.
 */
export async function enrichProspect(input: EnrichProspectInput): Promise<EnrichProspectResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    return { ok: false, error: 'Not signed in' };
  }

  const res = await fetch('/api/prospects/enrich', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      companyName: input.companyName,
      websiteUrl: input.websiteUrl,
      contactName: input.contactName,
      phone: input.phone,
      email: input.email,
      city: input.city,
      retailChannelHint: input.retailChannelHint,
      territoryCode: input.territoryCode,
    }),
  });

  let payload: { ok?: boolean; prospect?: Prospect; error?: string } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    return { ok: false, error: `Enrich failed (${res.status})` };
  }

  if (!res.ok || !payload.ok || !payload.prospect) {
    return { ok: false, error: payload.error || `Enrich failed (${res.status})` };
  }

  return { ok: true, prospect: payload.prospect };
}
