import { supabase } from '@/lib/supabase';
import type { EnrichedProspectFields } from '@/lib/createEnrichedProspect';
import type { Prospect } from '@/lib/prospects';
import type { ProspectResearchPreview } from '@/lib/updateProspectResearch';

export type PreviewProspectResearchClientResult =
  { ok: true; preview: ProspectResearchPreview } | { ok: false; error: string };

export type ApplyProspectResearchClientResult =
  { ok: true; prospect: Prospect } | { ok: false; error: string };

async function bearerToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Client call for AI Update Research preview. */
export async function previewProspectResearchUpdate(input: {
  prospectId: number;
  websiteUrl?: string;
}): Promise<PreviewProspectResearchClientResult> {
  const token = await bearerToken();
  if (!token) {
    return { ok: false, error: 'Not signed in' };
  }

  const res = await fetch('/api/prospects/research-update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      prospectId: input.prospectId,
      websiteUrl: input.websiteUrl,
    }),
  });

  let payload: { ok?: boolean; preview?: ProspectResearchPreview; error?: string } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    return { ok: false, error: `Research update failed (${res.status})` };
  }

  if (!res.ok || !payload.ok || !payload.preview) {
    return { ok: false, error: payload.error || `Research update failed (${res.status})` };
  }

  return { ok: true, preview: payload.preview };
}

/** Client call to apply AI Update Research after confirm. */
export async function applyProspectResearchUpdate(input: {
  prospectId: number;
  fields: EnrichedProspectFields;
}): Promise<ApplyProspectResearchClientResult> {
  const token = await bearerToken();
  if (!token) {
    return { ok: false, error: 'Not signed in' };
  }

  const res = await fetch('/api/prospects/research-update/apply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      prospectId: input.prospectId,
      fields: input.fields,
    }),
  });

  let payload: { ok?: boolean; prospect?: Prospect; error?: string } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    return { ok: false, error: `Apply research update failed (${res.status})` };
  }

  if (!res.ok || !payload.ok || !payload.prospect) {
    return { ok: false, error: payload.error || `Apply research update failed (${res.status})` };
  }

  return { ok: true, prospect: payload.prospect };
}
