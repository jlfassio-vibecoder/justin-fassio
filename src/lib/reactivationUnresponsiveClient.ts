import { supabase } from '@/lib/supabase';
import type { LineAccountMarker, RelationshipStatus } from '@/types/database';

export type ReactivationUnresponsiveClientAction = 'mark_unresponsive' | 'reopen_candidate';

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

export async function setReactivationUnresponsiveClient(input: {
  retailerId: number;
  salesLineId: string | null;
  action: ReactivationUnresponsiveClientAction;
}): Promise<
  | { ok: true; relationshipStatus: RelationshipStatus; markers: LineAccountMarker[] }
  | { ok: false; error: string }
> {
  const auth = await bearerHeaders();
  if (!auth.ok) return auth;

  const res = await fetch('/api/staff/line-accounts/reactivation-unresponsive', {
    method: 'POST',
    headers: auth.headers,
    body: JSON.stringify({
      retailer_id: input.retailerId,
      sales_line_id: input.salesLineId,
      action: input.action,
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    relationshipStatus?: RelationshipStatus;
    markers?: LineAccountMarker[];
    error?: string;
  };
  if (!res.ok || !payload.ok || !payload.markers || !payload.relationshipStatus) {
    return {
      ok: false,
      error: payload.error || `Reactivation update failed (${res.status})`,
    };
  }
  return {
    ok: true,
    relationshipStatus: payload.relationshipStatus,
    markers: payload.markers,
  };
}
