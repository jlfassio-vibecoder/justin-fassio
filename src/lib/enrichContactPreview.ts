import { supabase } from '@/lib/supabase';
import type { AccountContact } from '@/lib/accountContacts';
import type { ContactEnrichPreview } from '@/lib/createEnrichedContact';
import type { Prospect } from '@/lib/prospects';
import type { AccountContactRole } from '@/types/database';

export type PreviewContactEnrichResult =
  { ok: true; preview: ContactEnrichPreview } | { ok: false; error: string };

export type ApplyContactEnrichResult =
  { ok: true; prospect: Prospect; contact: AccountContact } | { ok: false; error: string };

async function bearerToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Client call for contact discovery preview in Account Research. */
export async function previewContactEnrich(input: {
  accountId: number;
  candidateName?: string;
  resolvedWebsite?: string;
  salesLineId?: string;
  retailerLineAccountId?: string;
}): Promise<PreviewContactEnrichResult> {
  const token = await bearerToken();
  if (!token) {
    return { ok: false, error: 'Not signed in' };
  }

  const res = await fetch('/api/contacts/enrich/preview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      accountId: input.accountId,
      candidateName: input.candidateName,
      resolvedWebsite: input.resolvedWebsite,
      salesLineId: input.salesLineId,
      retailerLineAccountId: input.retailerLineAccountId,
    }),
  });

  let payload: { ok?: boolean; preview?: ContactEnrichPreview; error?: string } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    return { ok: false, error: `Contact preview failed (${res.status})` };
  }

  if (!res.ok || !payload.ok || !payload.preview) {
    return { ok: false, error: payload.error || `Contact preview failed (${res.status})` };
  }

  return { ok: true, preview: payload.preview };
}

/** Client call to apply staff-confirmed contact after preview. */
export async function applyContactEnrich(input: {
  accountId: number;
  fullName: string;
  title?: string | null;
  phone?: string | null;
  email?: string | null;
  role: AccountContactRole;
  notes?: string | null;
  confirmDuplicateEmail?: boolean;
  salesLineId?: string;
  retailerLineAccountId?: string;
}): Promise<ApplyContactEnrichResult> {
  const token = await bearerToken();
  if (!token) {
    return { ok: false, error: 'Not signed in' };
  }

  const res = await fetch('/api/contacts/enrich/apply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      accountId: input.accountId,
      fullName: input.fullName,
      title: input.title,
      phone: input.phone,
      email: input.email,
      role: input.role,
      notes: input.notes,
      confirmDuplicateEmail: input.confirmDuplicateEmail,
      salesLineId: input.salesLineId,
      retailerLineAccountId: input.retailerLineAccountId,
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
    return { ok: false, error: `Contact apply failed (${res.status})` };
  }

  if (!res.ok || !payload.ok || !payload.prospect || !payload.contact) {
    return { ok: false, error: payload.error || `Contact apply failed (${res.status})` };
  }

  return { ok: true, prospect: payload.prospect, contact: payload.contact };
}
