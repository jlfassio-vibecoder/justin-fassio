import { supabase } from '@/lib/supabase';
import type { Line, LineStatus } from '@/types/database';
import type { LineKey } from '@/types';

/** v1 represented picker codes (exclude bkg + prospective / declined / terminated). */
export const REPRESENTED_LINE_CODES = [
  'ogr',
  'eagle-peak',
  'big-fish',
] as const satisfies readonly LineKey[];

export const REPRESENTED_LINE_STATUSES = [
  'active',
  'onboarding',
  'confirmed',
] as const satisfies readonly LineStatus[];

export function isRepresentedLineCode(code: string): code is LineKey {
  return (REPRESENTED_LINE_CODES as readonly string[]).includes(code);
}

export type LinePortfolio = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  status: LineStatus;
  tagline: string | null;
  description: string | null;
  heroImagePath: string | null;
  heroImageUrl: string | null;
  sortOrder: number;
  publicShowroomPath: string | null;
};

export type LinePortfolioPatch = {
  tagline?: string | null;
  description?: string | null;
  heroImageUrl?: string | null;
  sortOrder?: number;
  publicShowroomPath?: string | null;
};

export type PublicActiveLine = {
  id: string;
  code: string;
  name: string;
  tagline: string | null;
  description: string | null;
  heroImageUrl: string | null;
  sortOrder: number;
  publicShowroomPath: string | null;
};

export const LINE_SELECT =
  'id, code, name, active, status, tagline, description, hero_image_path, hero_image_url, sort_order, public_showroom_path, principal_id, default_currency, created_at, updated_at' as const;

export function mapLineRow(row: Line): LinePortfolio {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active,
    status: row.status,
    tagline: row.tagline,
    description: row.description,
    heroImagePath: row.hero_image_path,
    heroImageUrl: row.hero_image_url,
    sortOrder: row.sort_order,
    publicShowroomPath: row.public_showroom_path,
  };
}

/** Resolve the Old Guys Rule line UUID, or null if missing / errored. */
export async function resolveOgrLineId(): Promise<string | null> {
  const { data, error } = await supabase.from('lines').select('id').eq('code', 'ogr').maybeSingle();
  if (error || !data) return null;
  return data.id;
}

export async function fetchActiveLines(): Promise<{
  data: LinePortfolio[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('lines')
    .select(LINE_SELECT)
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []).map((row) => mapLineRow(row as Line)), error: null };
}

/**
 * Represented portfolio for the Phase 2 staff picker.
 * status in (active, onboarding, confirmed) and code in (ogr, eagle-peak, big-fish).
 */
export async function fetchRepresentedLines(): Promise<{
  data: LinePortfolio[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('lines')
    .select(LINE_SELECT)
    .in('code', [...REPRESENTED_LINE_CODES])
    .in('status', [...REPRESENTED_LINE_STATUSES])
    .order('sort_order', { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []).map((row) => mapLineRow(row as Line)), error: null };
}

export async function fetchLineByCode(
  code: string,
): Promise<{ data: LinePortfolio | null; error: string | null }> {
  const normalized = code.trim().toLowerCase();
  if (!normalized) {
    return { data: null, error: 'Line code is required' };
  }

  const { data, error } = await supabase
    .from('lines')
    .select(LINE_SELECT)
    .eq('code', normalized)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }
  if (!data) {
    return { data: null, error: null };
  }

  return { data: mapLineRow(data as Line), error: null };
}

export async function fetchPublicActiveLines(): Promise<{
  data: PublicActiveLine[];
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('get_public_active_lines');

  if (error) {
    return { data: [], error: error.message };
  }

  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      tagline: row.tagline,
      description: row.description,
      heroImageUrl: row.hero_image_url,
      sortOrder: row.sort_order,
      publicShowroomPath: row.public_showroom_path,
    })),
    error: null,
  };
}

export async function updateLine(
  code: string,
  patch: LinePortfolioPatch,
): Promise<{ ok: true; line: LinePortfolio } | { ok: false; error: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'Not signed in' };

  const res = await fetch(`/api/lines/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ patch }),
  });

  let payload: { ok?: boolean; line?: LinePortfolio; error?: string } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    return { ok: false, error: `Update failed (${res.status})` };
  }

  if (!res.ok || !payload.ok || !payload.line) {
    return { ok: false, error: payload.error || `Update failed (${res.status})` };
  }
  return { ok: true, line: payload.line };
}

export async function uploadLineHeroImage(input: {
  code: string;
  file: File;
}): Promise<{ ok: true; line: LinePortfolio } | { ok: false; error: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'Not signed in' };

  const form = new FormData();
  form.set('file', input.file);

  const res = await fetch(`/api/lines/${encodeURIComponent(input.code)}/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  let payload: { ok?: boolean; line?: LinePortfolio; error?: string } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    return { ok: false, error: `Upload failed (${res.status})` };
  }

  if (!res.ok || !payload.ok || !payload.line) {
    return { ok: false, error: payload.error || `Upload failed (${res.status})` };
  }
  return { ok: true, line: payload.line };
}
