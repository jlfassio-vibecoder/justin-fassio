import { supabase } from '@/lib/supabase';
import type { LookalikeJobSnapshot, LookalikeSeedListItem } from '@/lib/lookalike/types';

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

async function parseLookalikeResponse<T>(
  res: Response,
): Promise<{ ok: true; payload: T } | { ok: false; error: string }> {
  const payload = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!res.ok || !payload.ok) {
    return { ok: false, error: payload.error || `Lookalike request failed (${res.status})` };
  }
  return { ok: true, payload };
}

export async function listLookalikeSeedsClient(input: {
  salesLineId: string;
}): Promise<{ ok: true; seeds: LookalikeSeedListItem[] } | { ok: false; error: string }> {
  const auth = await bearerHeaders();
  if (!auth.ok) return auth;
  const params = new URLSearchParams({ sales_line_id: input.salesLineId });
  const res = await fetch(`/api/staff/lookalike/seeds?${params.toString()}`, {
    headers: auth.headers,
  });
  const parsed = await parseLookalikeResponse<{ ok: true; seeds: LookalikeSeedListItem[] }>(res);
  if (!parsed.ok) return parsed;
  return { ok: true, seeds: parsed.payload.seeds };
}

export async function startLookalikeJobClient(input: {
  salesLineId: string;
  seedRetailerIds: number[];
}): Promise<{ ok: true; snapshot: LookalikeJobSnapshot } | { ok: false; error: string }> {
  const auth = await bearerHeaders();
  if (!auth.ok) return auth;
  const res = await fetch('/api/staff/lookalike/jobs', {
    method: 'POST',
    headers: auth.headers,
    body: JSON.stringify({
      sales_line_id: input.salesLineId,
      seed_retailer_ids: input.seedRetailerIds,
    }),
  });
  const parsed = await parseLookalikeResponse<{ ok: true; snapshot: LookalikeJobSnapshot }>(res);
  if (!parsed.ok) return parsed;
  return { ok: true, snapshot: parsed.payload.snapshot };
}

async function postLookalikeJob(
  path: string,
  input: { salesLineId: string; jobId: string; body?: Record<string, unknown> },
): Promise<{ ok: true; snapshot: LookalikeJobSnapshot } | { ok: false; error: string }> {
  const auth = await bearerHeaders();
  if (!auth.ok) return auth;
  const res = await fetch(`/api/staff/lookalike/jobs/${encodeURIComponent(input.jobId)}/${path}`, {
    method: 'POST',
    headers: auth.headers,
    body: JSON.stringify({
      sales_line_id: input.salesLineId,
      ...input.body,
    }),
  });
  const parsed = await parseLookalikeResponse<{ ok: true; snapshot: LookalikeJobSnapshot }>(res);
  if (!parsed.ok) return parsed;
  return { ok: true, snapshot: parsed.payload.snapshot };
}

export async function processLookalikeJobClient(input: {
  salesLineId: string;
  jobId: string;
}): Promise<{ ok: true; snapshot: LookalikeJobSnapshot } | { ok: false; error: string }> {
  return postLookalikeJob('process', input);
}

export async function getLookalikeJobClient(input: {
  salesLineId: string;
  jobId: string;
}): Promise<{ ok: true; snapshot: LookalikeJobSnapshot } | { ok: false; error: string }> {
  const auth = await bearerHeaders();
  if (!auth.ok) return auth;
  const params = new URLSearchParams({ sales_line_id: input.salesLineId });
  const res = await fetch(
    `/api/staff/lookalike/jobs/${encodeURIComponent(input.jobId)}/status?${params.toString()}`,
    { headers: auth.headers },
  );
  const parsed = await parseLookalikeResponse<{ ok: true; snapshot: LookalikeJobSnapshot }>(res);
  if (!parsed.ok) return parsed;
  return { ok: true, snapshot: parsed.payload.snapshot };
}

export async function cancelLookalikeJobClient(input: {
  salesLineId: string;
  jobId: string;
}): Promise<{ ok: true; snapshot: LookalikeJobSnapshot } | { ok: false; error: string }> {
  return postLookalikeJob('cancel', input);
}

export async function reviewLookalikeCandidateClient(input: {
  salesLineId: string;
  jobId: string;
  candidateId: string;
  action: 'approve' | 'reject';
}): Promise<{ ok: true; snapshot: LookalikeJobSnapshot } | { ok: false; error: string }> {
  const auth = await bearerHeaders();
  if (!auth.ok) return auth;
  const res = await fetch(
    `/api/staff/lookalike/jobs/${encodeURIComponent(input.jobId)}/candidates/${encodeURIComponent(input.candidateId)}/review`,
    {
      method: 'POST',
      headers: auth.headers,
      body: JSON.stringify({
        sales_line_id: input.salesLineId,
        action: input.action,
      }),
    },
  );
  const parsed = await parseLookalikeResponse<{ ok: true; snapshot: LookalikeJobSnapshot }>(res);
  if (!parsed.ok) return parsed;
  return { ok: true, snapshot: parsed.payload.snapshot };
}
