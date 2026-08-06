import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { LINE_SELECT, mapLineRow } from '@/lib/lines';
import type { Line } from '@/types/database';

export const prerender = false;

const BUCKET = 'catalog-assets';
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function extForMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'jpg';
}

export const POST: APIRoute = async ({ params, request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const code = params.code?.trim().toLowerCase();
  if (!code) return jsonError('Line code is required', 400);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError('Expected multipart form data', 400);
  }

  const file = form.get('file');
  if (!(file instanceof File)) return jsonError('file is required', 400);
  if (!ALLOWED.has(file.type)) {
    return jsonError('Unsupported image type (use jpeg, png, webp, or gif)', 400);
  }
  if (file.size > MAX_BYTES) {
    return jsonError('Image must be 8MB or smaller', 400);
  }

  const { data: line, error: lineError } = await gate.supabase
    .from('lines')
    .select('id, code')
    .eq('code', code)
    .maybeSingle();
  if (lineError) return jsonError(lineError.message, 502);
  if (!line) return jsonError('Line not found', 404);

  const ext = extForMime(file.type);
  const path = `${line.id}/brand/hero-${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await gate.supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) return jsonError(uploadError.message, 502);

  const { data: publicData } = gate.supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = publicData.publicUrl;

  const { data, error: updateError } = await gate.supabase
    .from('lines')
    .update({
      hero_image_path: path,
      hero_image_url: publicUrl,
    })
    .eq('id', line.id)
    .select(LINE_SELECT)
    .single();

  if (updateError) return jsonError(updateError.message, 502);
  if (!data) return jsonError('Line update returned no row', 502);

  return new Response(JSON.stringify({ ok: true, line: mapLineRow(data as Line) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
