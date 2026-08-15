import { supabase } from '@/lib/supabase';

/** Structured rates returned by POST /api/pricing/landed-rates (Phase III+). */
export type LandedRatesPayload = {
  fx: number;
  freightRate?: number;
  gstRate?: number;
  otherTaxRate?: number;
  brief: string;
  asOf: string;
};

export type FetchLandedRatesResult =
  { ok: true; rates: LandedRatesPayload } | { ok: false; error: string };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseRatesPayload(raw: unknown): LandedRatesPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isFiniteNumber(o.fx)) return null;
  if (typeof o.brief !== 'string' || typeof o.asOf !== 'string') return null;

  const rates: LandedRatesPayload = {
    fx: o.fx,
    brief: o.brief,
    asOf: o.asOf,
  };
  if (isFiniteNumber(o.freightRate)) rates.freightRate = o.freightRate;
  if (isFiniteNumber(o.gstRate)) rates.gstRate = o.gstRate;
  if (isFiniteNumber(o.otherTaxRate)) rates.otherTaxRate = o.otherTaxRate;
  return rates;
}

/**
 * Client call to POST /api/pricing/landed-rates with the current session Bearer token.
 */
export async function fetchLandedRates(input?: {
  salesLineId?: string;
}): Promise<FetchLandedRatesResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    return { ok: false, error: 'Not signed in' };
  }

  const res = await fetch('/api/pricing/landed-rates', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input?.salesLineId ? { salesLineId: input.salesLineId } : {}),
  });

  let payload: { ok?: boolean; rates?: unknown; error?: string } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    return { ok: false, error: `Landed rates update failed (${res.status})` };
  }

  if (!res.ok || !payload.ok) {
    return {
      ok: false,
      error: payload.error || `Landed rates update failed (${res.status})`,
    };
  }

  const rates = parseRatesPayload(payload.rates);
  if (!rates) {
    return { ok: false, error: 'Landed rates response was incomplete' };
  }

  return { ok: true, rates };
}
