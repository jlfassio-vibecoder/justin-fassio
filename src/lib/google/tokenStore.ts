import type { SupabaseClient } from '@supabase/supabase-js';
import {
  scopesIncludeCalendarEvents,
  scopesIncludeGmailCompose,
  scopesIncludeGmailReadonly,
} from '@/lib/google/config';
import type { GoogleConnectionPublic } from '@/lib/google/connectionTypes';
import { decryptRefreshToken, encryptRefreshToken } from '@/lib/google/tokenCrypto';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';
import type { Database } from '@/types/database';

type AdminClient = SupabaseClient<Database>;

export type GoogleConnectionRow = Database['public']['Tables']['google_account_connections']['Row'];

export class GoogleTokenStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleTokenStoreError';
  }
}

function requireAdmin(client?: AdminClient | null): AdminClient {
  const admin = client ?? getServiceRoleClient();
  if (!admin) {
    throw new GoogleTokenStoreError('Server misconfigured (missing service role)');
  }
  return admin;
}

export function toPublicConnection(
  row: GoogleConnectionRow | null | undefined,
): GoogleConnectionPublic {
  if (!row) {
    return {
      connected: false,
      googleEmail: null,
      status: null,
      scopes: [],
      hasGmailReadonly: false,
      hasGmailCompose: false,
      hasCalendarEvents: false,
    };
  }
  const status =
    row.status === 'active' || row.status === 'revoked' || row.status === 'error'
      ? row.status
      : 'error';
  const scopes = Array.isArray(row.scopes) ? [...row.scopes] : [];
  return {
    connected: status === 'active',
    googleEmail: row.google_email,
    status,
    scopes,
    hasGmailReadonly: scopesIncludeGmailReadonly(scopes),
    hasGmailCompose: scopesIncludeGmailCompose(scopes),
    hasCalendarEvents: scopesIncludeCalendarEvents(scopes),
  };
}

/** Strip secrets — used in tests/assertions for API payloads. */
export function assertNoSecretsInPublic(value: unknown): void {
  const text = JSON.stringify(value);
  if (/refresh_token|ciphertext|access_token|client_secret|ENCRYPTION_KEY/i.test(text)) {
    throw new GoogleTokenStoreError('Public connection payload must not include secrets');
  }
}

export async function loadConnectionForProfile(
  profileId: string,
  client?: AdminClient | null,
): Promise<GoogleConnectionRow | null> {
  const admin = requireAdmin(client);
  const { data, error } = await admin
    .from('google_account_connections')
    .select(
      'id, profile_id, google_sub, google_email, refresh_token_ciphertext, scopes, status, created_at, updated_at',
    )
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) {
    throw new GoogleTokenStoreError(error.message);
  }
  return data;
}

export async function upsertGoogleConnection(params: {
  profileId: string;
  googleSub: string;
  googleEmail: string;
  refreshToken: string;
  scopes: string[];
  client?: AdminClient | null;
}): Promise<GoogleConnectionRow> {
  const admin = requireAdmin(params.client);
  const ciphertext = encryptRefreshToken(params.refreshToken);
  const { data, error } = await admin
    .from('google_account_connections')
    .upsert(
      {
        profile_id: params.profileId,
        google_sub: params.googleSub,
        google_email: params.googleEmail,
        refresh_token_ciphertext: ciphertext,
        scopes: params.scopes,
        status: 'active',
      },
      { onConflict: 'profile_id' },
    )
    .select(
      'id, profile_id, google_sub, google_email, refresh_token_ciphertext, scopes, status, created_at, updated_at',
    )
    .single();
  if (error || !data) {
    throw new GoogleTokenStoreError(error?.message ?? 'Failed to store Google connection');
  }
  return data;
}

export async function deleteGoogleConnection(
  profileId: string,
  client?: AdminClient | null,
): Promise<{ deleted: boolean; refreshToken: string | null }> {
  const admin = requireAdmin(client);
  const existing = await loadConnectionForProfile(profileId, admin);
  if (!existing) {
    return { deleted: false, refreshToken: null };
  }
  let refreshToken: string | null = null;
  try {
    refreshToken = decryptRefreshToken(existing.refresh_token_ciphertext);
  } catch {
    // Still delete the row if ciphertext cannot be decrypted.
  }
  const { error } = await admin
    .from('google_account_connections')
    .delete()
    .eq('profile_id', profileId);
  if (error) {
    throw new GoogleTokenStoreError(error.message);
  }
  return { deleted: true, refreshToken };
}
