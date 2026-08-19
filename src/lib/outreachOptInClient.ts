import { supabase } from '@/lib/supabase';
import type { LineAccountMarker } from '@/types/database';

async function bearerHeaders(): Promise<
  { ok: true; headers: HeadersInit } | { ok: false; error: string }
> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'Not signed in' };
  return {
    ok: true,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
}

export async function setOutreachEligibleClient(input: {
  retailerId: number;
  salesLineId: string | null;
  eligible: boolean;
}): Promise<{ ok: true; markers: LineAccountMarker[] } | { ok: false; error: string }> {
  const auth = await bearerHeaders();
  if (!auth.ok) return auth;

  try {
    const res = await fetch('/api/staff/line-accounts/outreach-opt-in', {
      method: 'POST',
      headers: auth.headers,
      body: JSON.stringify({
        retailer_id: input.retailerId,
        sales_line_id: input.salesLineId,
        eligible: input.eligible,
      }),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      markers?: LineAccountMarker[];
      error?: string;
    };
    if (!res.ok || !payload.ok || !payload.markers) {
      return { ok: false, error: payload.error || `Outreach opt-in failed (${res.status})` };
    }
    return { ok: true, markers: payload.markers };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Outreach opt-in failed',
    };
  }
}
