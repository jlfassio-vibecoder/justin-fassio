import {
  BIG_FISH_WHOLESALE_PATH,
  EAGLE_PEAK_WHOLESALE_PATH,
  OGR_WHOLESALE_PATH,
} from '@/data/landing';
import { supabase } from '@/lib/supabase';
import type { Line, LineStatus } from '@/types/database';

/** Seed marketing / special-case codes — not picker membership. */
export const REPRESENTED_LINE_CODES = ['ogr', 'eagle-peak', 'big-fish'] as const;

export const REPRESENTED_LINE_STATUSES = [
  'active',
  'onboarding',
  'confirmed',
] as const satisfies readonly LineStatus[];

/** Seed-code helper for public paths, EP geo, and BF currency — not workspace membership. */
export function isRepresentedLineCode(code: string): boolean {
  return (REPRESENTED_LINE_CODES as readonly string[]).includes(code);
}

/** Picker / route membership after a `lines` row is loaded. */
export function isRepresentedLineStatus(status: string, code: string): boolean {
  if (code === 'bkg') return false;
  return (REPRESENTED_LINE_STATUSES as readonly string[]).includes(status);
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
  defaultCurrency: string | null;
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

type PublicLineCardRow = {
  id: string;
  code: string;
  name: string;
  tagline: string | null;
  description: string | null;
  hero_image_url: string | null;
  sort_order: number;
  public_showroom_path: string | null;
};

export const PUBLIC_LINE_CARD_FALLBACKS: PublicActiveLine[] = [
  {
    id: 'fallback-ogr',
    code: 'ogr',
    name: 'Old Guys Rule',
    tagline: 'Now Repping',
    description: 'Apparel & lifestyle goods for the surf and skate crowd.',
    heroImageUrl: null,
    sortOrder: 10,
    publicShowroomPath: OGR_WHOLESALE_PATH,
  },
  {
    id: 'fallback-eagle-peak',
    code: 'eagle-peak',
    name: 'Eagle Peak',
    tagline: 'Now Repping',
    description: 'Canopy / shade products (onboarding).',
    heroImageUrl: null,
    sortOrder: 30,
    publicShowroomPath: EAGLE_PEAK_WHOLESALE_PATH,
  },
  {
    id: 'fallback-big-fish',
    code: 'big-fish',
    name: 'Big Fish',
    tagline: 'Coming soon',
    description: 'Confirmed represented line; commercial terms not yet configured.',
    heroImageUrl: null,
    sortOrder: 40,
    publicShowroomPath: BIG_FISH_WHOLESALE_PATH,
  },
];

export function mapPublicActiveLineRow(row: PublicLineCardRow): PublicActiveLine {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    heroImageUrl: row.hero_image_url,
    sortOrder: row.sort_order,
    publicShowroomPath: row.public_showroom_path,
  };
}

/** Prefer live RPC rows; fill missing represented codes from fallbacks. */
export function mergePublicLineCards(rpcRows: PublicActiveLine[]): PublicActiveLine[] {
  const byCode = new Map(rpcRows.map((row) => [row.code, row]));
  return PUBLIC_LINE_CARD_FALLBACKS.map((fallback) => {
    const live = byCode.get(fallback.code);
    if (!live) return fallback;
    return {
      ...fallback,
      ...live,
      publicShowroomPath: live.publicShowroomPath ?? fallback.publicShowroomPath,
      tagline: live.tagline ?? fallback.tagline,
      description: live.description ?? fallback.description,
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

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
    defaultCurrency: row.default_currency,
  };
}

/** Resolve the Old Guys Rule line UUID, or null if missing / errored. */
export async function resolveOgrLineId(): Promise<string | null> {
  const { data, error } = await supabase.from('lines').select('id').eq('code', 'ogr').maybeSingle();
  if (error || !data) return null;
  return data.id;
}

/** Explicit line id, else OGR — for confirmed legacy /app write paths only. */
export async function resolveWriteSalesLineId(explicit?: string | null): Promise<string | null> {
  const trimmed = explicit?.trim() || '';
  if (trimmed) return trimmed;
  return resolveOgrLineId();
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
 * Represented portfolio for the staff picker.
 * status in (active, onboarding, confirmed); never `bkg`.
 */
export async function fetchRepresentedLines(): Promise<{
  data: LinePortfolio[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('lines')
    .select(LINE_SELECT)
    .neq('code', 'bkg')
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
    data: (data ?? []).map((row) => mapPublicActiveLineRow(row)),
    error: null,
  };
}

export async function fetchPublicLineCards(): Promise<{
  data: PublicActiveLine[];
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('get_public_line_cards');

  if (error) {
    return { data: [], error: error.message };
  }

  return {
    data: (data ?? []).map((row) => mapPublicActiveLineRow(row)),
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
