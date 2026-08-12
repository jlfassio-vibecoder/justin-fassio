import type { APIRoute } from 'astro';
import { requireApprovedStaffClient, type AgentSupabase } from '@/lib/agentAuth';
import {
  STAFF_AVATAR_ALLOWED_TYPES,
  STAFF_AVATAR_BUCKET,
  STAFF_AVATAR_MAX_BYTES,
  staffAvatarObjectPath,
} from '@/lib/staffAccount';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function readCurrentAvatarPath(
  client: AgentSupabase,
  userId: string,
): Promise<{ path: string | null; error: string | null }> {
  const { data, error } = await client
    .from('profiles')
    .select('avatar_path')
    .eq('id', userId)
    .maybeSingle();
  if (error) return { path: null, error: error.message };
  const path = typeof data?.avatar_path === 'string' ? data.avatar_path.trim() : '';
  return { path: path || null, error: null };
}

async function deleteAvatarObject(
  client: AgentSupabase,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  const { error } = await client.storage.from(STAFF_AVATAR_BUCKET).remove([path]);
  return error?.message ?? null;
}

export const POST: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: 'Expected multipart form data' }, 400);
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return json({ ok: false, error: 'file is required' }, 400);
  }
  if (!STAFF_AVATAR_ALLOWED_TYPES.has(file.type)) {
    return json({ ok: false, error: 'Use a JPEG, PNG, or WebP image' }, 400);
  }
  if (file.size > STAFF_AVATAR_MAX_BYTES) {
    return json({ ok: false, error: 'Image must be 2MB or smaller' }, 400);
  }

  const current = await readCurrentAvatarPath(gate.supabase, gate.userId);
  if (current.error) return json({ ok: false, error: current.error }, 502);

  const removed = await deleteAvatarObject(gate.supabase, current.path);
  if (removed) return json({ ok: false, error: removed }, 502);

  const path = staffAvatarObjectPath(gate.userId, file.type);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await gate.supabase.storage
    .from(STAFF_AVATAR_BUCKET)
    .upload(path, bytes, {
      contentType: file.type,
      upsert: true,
    });
  if (uploadError) return json({ ok: false, error: uploadError.message }, 502);

  const { error: updateError } = await gate.supabase
    .from('profiles')
    .update({ avatar_path: path })
    .eq('id', gate.userId);
  if (updateError) return json({ ok: false, error: updateError.message }, 502);

  return json({ ok: true, avatarPath: path });
};

export const DELETE: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const current = await readCurrentAvatarPath(gate.supabase, gate.userId);
  if (current.error) return json({ ok: false, error: current.error }, 502);

  const removed = await deleteAvatarObject(gate.supabase, current.path);
  if (removed) return json({ ok: false, error: removed }, 502);

  const { error: updateError } = await gate.supabase
    .from('profiles')
    .update({ avatar_path: null })
    .eq('id', gate.userId);
  if (updateError) return json({ ok: false, error: updateError.message }, 502);

  return json({ ok: true });
};
