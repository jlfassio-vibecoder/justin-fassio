import { supabase } from '@/lib/supabase';
import type { OpsReviewListItem } from '@/lib/operationalTerritories/reviewHttp';
import type { Prospect } from '@/lib/prospects';

async function bearerHeaders(): Promise<HeadersInit | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return null;
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchOpsTerritoryReviewList(): Promise<
  { ok: true; items: OpsReviewListItem[] } | { ok: false; error: string }
> {
  const headers = await bearerHeaders();
  if (!headers) return { ok: false, error: 'Not signed in' };
  const res = await fetch('/api/staff/operational-territory-review', { headers });
  const body = (await res.json()) as { ok: boolean; items?: OpsReviewListItem[]; error?: string };
  if (!res.ok || !body.ok) return { ok: false, error: body.error ?? 'Failed to load review queue' };
  return { ok: true, items: body.items ?? [] };
}

export async function fetchOpsTerritoryReviewCount(): Promise<
  { ok: true; count: number } | { ok: false; error: string }
> {
  const headers = await bearerHeaders();
  if (!headers) return { ok: false, error: 'Not signed in' };
  const res = await fetch('/api/staff/operational-territory-review/count', { headers });
  const body = (await res.json()) as { ok: boolean; count?: number; error?: string };
  if (!res.ok || !body.ok) return { ok: false, error: body.error ?? 'Failed to load count' };
  return { ok: true, count: body.count ?? 0 };
}

export async function applyOpsTerritorySuggestion(prospectId: number): Promise<
  | {
      ok: true;
      prospect: Prospect;
      auditWarning: string | null;
      reviewWarning: string | null;
    }
  | { ok: false; error: string }
> {
  const headers = await bearerHeaders();
  if (!headers) return { ok: false, error: 'Not signed in' };
  const res = await fetch(
    `/api/staff/operational-territory-review/${prospectId}/apply-suggestion`,
    { method: 'POST', headers },
  );
  const body = (await res.json()) as {
    ok: boolean;
    prospect?: Prospect;
    auditWarning?: string | null;
    reviewWarning?: string | null;
    error?: string;
  };
  if (!res.ok || !body.ok || !body.prospect) {
    return { ok: false, error: body.error ?? 'Apply suggestion failed' };
  }
  return {
    ok: true,
    prospect: body.prospect,
    auditWarning: body.auditWarning ?? null,
    reviewWarning: body.reviewWarning ?? null,
  };
}

export async function assignOpsTerritory(
  prospectId: number,
  operationalTerritoryId: string,
): Promise<
  | {
      ok: true;
      prospect: Prospect;
      auditWarning: string | null;
      reviewWarning: string | null;
    }
  | { ok: false; error: string }
> {
  const headers = await bearerHeaders();
  if (!headers) return { ok: false, error: 'Not signed in' };
  const res = await fetch(`/api/staff/operational-territory-review/${prospectId}/assign`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ operationalTerritoryId }),
  });
  const body = (await res.json()) as {
    ok: boolean;
    prospect?: Prospect;
    auditWarning?: string | null;
    reviewWarning?: string | null;
    error?: string;
  };
  if (!res.ok || !body.ok || !body.prospect) {
    return { ok: false, error: body.error ?? 'Assign failed' };
  }
  return {
    ok: true,
    prospect: body.prospect,
    auditWarning: body.auditWarning ?? null,
    reviewWarning: body.reviewWarning ?? null,
  };
}

export async function leaveOpsTerritoryUnassigned(
  prospectId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const headers = await bearerHeaders();
  if (!headers) return { ok: false, error: 'Not signed in' };
  const res = await fetch(
    `/api/staff/operational-territory-review/${prospectId}/leave-unassigned`,
    { method: 'POST', headers },
  );
  const body = (await res.json()) as { ok: boolean; error?: string };
  if (!res.ok || !body.ok) return { ok: false, error: body.error ?? 'Leave unassigned failed' };
  return { ok: true };
}
