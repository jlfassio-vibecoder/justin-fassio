import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { LINE_SELECT, mapLineRow, type LinePortfolioPatch } from '@/lib/lines';
import type { Database, Line } from '@/types/database';

export const prerender = false;

type LineUpdate = Database['public']['Tables']['lines']['Update'];

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export const PATCH: APIRoute = async ({ params, request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const code = params.code?.trim().toLowerCase();
  if (!code) return jsonError('Line code is required', 400);

  let body: { patch?: LinePortfolioPatch };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  if (!body.patch || typeof body.patch !== 'object') {
    return jsonError('patch is required', 400);
  }

  const tagline = optionalNullableString(body.patch.tagline);
  const description = optionalNullableString(body.patch.description);
  const heroImageUrl = optionalNullableString(body.patch.heroImageUrl);
  const publicShowroomPath = optionalNullableString(body.patch.publicShowroomPath);
  const sortOrder =
    typeof body.patch.sortOrder === 'number' && Number.isFinite(body.patch.sortOrder)
      ? Math.round(body.patch.sortOrder)
      : undefined;

  const update: LineUpdate = {};
  if (tagline !== undefined) update.tagline = tagline;
  if (description !== undefined) update.description = description;
  if (heroImageUrl !== undefined) {
    update.hero_image_url = heroImageUrl;
    if (heroImageUrl === null) {
      update.hero_image_path = null;
    }
  }
  if (publicShowroomPath !== undefined) update.public_showroom_path = publicShowroomPath;
  if (sortOrder !== undefined) update.sort_order = sortOrder;

  if (Object.keys(update).length === 0) {
    return jsonError('No valid patch fields provided', 400);
  }

  const { data, error } = await gate.supabase
    .from('lines')
    .update(update)
    .eq('code', code)
    .select(LINE_SELECT)
    .maybeSingle();

  if (error) return jsonError(error.message, 502);
  if (!data) return jsonError('Line not found', 404);

  return new Response(JSON.stringify({ ok: true, line: mapLineRow(data as Line) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
