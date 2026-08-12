import type { SupabaseClient, User } from '@supabase/supabase-js';
import { isValidOgrProductEmailRecipient } from '@/lib/ogrProductEmailLimits';
import { isUsableStaffDisplayName } from '@/lib/ogrProductEmailSender';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

type DbClient = SupabaseClient<Database>;

export const STAFF_AVATAR_BUCKET = 'staff-avatars';
export const STAFF_AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const STAFF_AVATAR_SIGNED_URL_SECONDS = 60 * 60;
export const STAFF_DISPLAY_NAME_MAX = 80;
export const STAFF_PASSWORD_MIN = 8;

export const STAFF_AVATAR_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type StaffAccountResult = { ok: true } | { ok: false; error: string };

export function normalizeStaffDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function validateStaffDisplayName(
  value: string,
  emails: Array<string | null | undefined> = [],
): { ok: true; displayName: string } | { ok: false; error: string } {
  const displayName = normalizeStaffDisplayName(value);
  if (!displayName) {
    return { ok: false, error: 'Display name is required' };
  }
  if (displayName.length > STAFF_DISPLAY_NAME_MAX) {
    return { ok: false, error: 'Display name is too long' };
  }
  if (!isUsableStaffDisplayName(displayName, emails)) {
    return { ok: false, error: 'Enter a real name, not an email address' };
  }
  return { ok: true, displayName };
}

export function validateStaffPassword(
  password: string,
  confirm: string,
): { ok: true; password: string } | { ok: false; error: string } {
  if (password.length < STAFF_PASSWORD_MIN) {
    return { ok: false, error: `Password must be at least ${STAFF_PASSWORD_MIN} characters` };
  }
  if (password !== confirm) {
    return { ok: false, error: 'Passwords do not match' };
  }
  return { ok: true, password };
}

export function pendingAuthEmail(user: User | null | undefined): string | null {
  const pending = user?.new_email?.trim();
  return pending || null;
}

/**
 * Keep profiles.email in lockstep with the current Auth email.
 * Never writes a pending unconfirmed address.
 */
export async function syncProfileEmailWithAuthUser(
  client: DbClient,
  input: {
    userId: string;
    authEmail: string | null | undefined;
    profileEmail: string | null | undefined;
  },
): Promise<{ ok: true; email: string | null } | { ok: false; error: string }> {
  const authEmail = (input.authEmail ?? '').trim();
  const profileEmail = (input.profileEmail ?? '').trim();
  if (!authEmail || authEmail === profileEmail) {
    return { ok: true, email: authEmail || input.profileEmail || null };
  }

  const { error } = await client
    .from('profiles')
    .update({ email: authEmail })
    .eq('id', input.userId);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, email: authEmail };
}

export async function updateStaffDisplayName(
  displayName: string,
  emails: Array<string | null | undefined> = [],
): Promise<StaffAccountResult> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { ok: false, error: 'Not signed in' };

  const validated = validateStaffDisplayName(displayName, [...emails, user.email]);
  if (!validated.ok) return validated;

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: validated.displayName })
    .eq('id', user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function requestStaffEmailChange(nextEmail: string): Promise<StaffAccountResult> {
  const trimmed = nextEmail.trim();
  if (!isValidOgrProductEmailRecipient(trimmed)) {
    return { ok: false, error: 'Enter a valid email address' };
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const { error } = await supabase.auth.updateUser(
    { email: trimmed },
    origin ? { emailRedirectTo: `${origin}/app/account` } : undefined,
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateStaffPassword(
  password: string,
  confirm: string,
): Promise<StaffAccountResult> {
  const validated = validateStaffPassword(password, confirm);
  if (!validated.ok) return validated;

  const { error } = await supabase.auth.updateUser({ password: validated.password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function staffAvatarObjectPath(userId: string, mime: string): string {
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  return `${userId}/avatar.${ext}`;
}

export function validateStaffAvatarFile(file: File): { ok: true } | { ok: false; error: string } {
  if (!STAFF_AVATAR_ALLOWED_TYPES.has(file.type)) {
    return { ok: false, error: 'Use a JPEG, PNG, or WebP image' };
  }
  if (file.size > STAFF_AVATAR_MAX_BYTES) {
    return { ok: false, error: 'Image must be 2MB or smaller' };
  }
  return { ok: true };
}

/**
 * Signed avatar URL for UI only — never persist this on profiles.
 */
export async function createStaffAvatarSignedUrl(
  avatarPath: string | null | undefined,
): Promise<string | null> {
  const path = (avatarPath ?? '').trim();
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(STAFF_AVATAR_BUCKET)
    .createSignedUrl(path, STAFF_AVATAR_SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function uploadStaffAvatar(
  file: File,
): Promise<{ ok: true; avatarPath: string } | { ok: false; error: string }> {
  const checked = validateStaffAvatarFile(file);
  if (!checked.ok) return checked;

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'Not signed in' };

  const form = new FormData();
  form.set('file', file);
  const res = await fetch('/api/staff/account/avatar', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  let payload: { ok?: boolean; avatarPath?: string; error?: string } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    return { ok: false, error: `Upload failed (${res.status})` };
  }
  if (!res.ok || !payload.ok || !payload.avatarPath) {
    return { ok: false, error: payload.error || `Upload failed (${res.status})` };
  }
  return { ok: true, avatarPath: payload.avatarPath };
}

export async function removeStaffAvatar(): Promise<StaffAccountResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'Not signed in' };

  const res = await fetch('/api/staff/account/avatar', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  let payload: { ok?: boolean; error?: string } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    return { ok: false, error: `Remove failed (${res.status})` };
  }
  if (!res.ok || !payload.ok) {
    return { ok: false, error: payload.error || `Remove failed (${res.status})` };
  }
  return { ok: true };
}

export function staffAccountInitials(
  displayName: string | null | undefined,
  emails: Array<string | null | undefined> = [],
): string {
  if (!isUsableStaffDisplayName(displayName, emails)) return '?';
  const parts = normalizeStaffDisplayName(displayName ?? '').split(' ');
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  const initials = `${first}${last}`.toUpperCase();
  return initials || '?';
}
