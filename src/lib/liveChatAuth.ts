import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

type Admin = SupabaseClient<Database>;

export type EphemeralChatCredentials = {
  email: string;
  password: string;
  userId: string;
};

/** Create a confirmed email/password user for visitor Realtime RLS (no anonymous auth required). */
export async function createEphemeralChatUser(
  admin: Admin,
): Promise<{ ok: true; credentials: EphemeralChatCredentials } | { ok: false; error: string }> {
  const id = crypto.randomUUID().replaceAll('-', '');
  const email = `livechat.${id}@users.noreply.justinfassio.com`;
  // Auth rejects passwords over bcrypt’s ~72-byte limit (SDK surfaces that as "{}").
  const password = `Lc!${id.slice(0, 24)}${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { live_chat: true },
  });

  if (error || !data.user) {
    const message = error?.message?.trim();
    return {
      ok: false,
      error: !message || message === '{}' ? 'Failed to create chat user' : message,
    };
  }

  return {
    ok: true,
    credentials: { email, password, userId: data.user.id },
  };
}
