import type { GoogleConnectionPublic } from '@/lib/google/connectionTypes';
import { supabase } from '@/lib/supabase';

async function staffBearer(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export type GoogleConnectionResult =
  { ok: true; connection: GoogleConnectionPublic } | { ok: false; error: string };

export async function fetchGoogleConnection(): Promise<GoogleConnectionResult> {
  const token = await staffBearer();
  if (!token) return { ok: false, error: 'Not signed in' };

  const res = await fetch('/api/staff/google/connection', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as {
    ok?: boolean;
    connection?: GoogleConnectionPublic;
    error?: string;
  };
  if (!res.ok || !body.ok || !body.connection) {
    return { ok: false, error: body.error ?? 'Failed to load Google connection' };
  }
  return { ok: true, connection: body.connection };
}

export type StartGoogleOAuthResult =
  { ok: true; authorizeUrl: string } | { ok: false; error: string };

export type StartGoogleOAuthOptions = {
  /** Default identity. gmail_readonly = Phase B; gmail_compose = Phase C. */
  scopes?: 'identity' | 'gmail_readonly' | 'gmail_compose';
};

export async function startGoogleOAuth(
  options: StartGoogleOAuthOptions = {},
): Promise<StartGoogleOAuthResult> {
  const token = await staffBearer();
  if (!token) return { ok: false, error: 'Not signed in' };

  const res = await fetch('/api/staff/google/oauth/start', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ scopes: options.scopes ?? 'identity' }),
  });
  const body = (await res.json()) as { ok?: boolean; authorizeUrl?: string; error?: string };
  if (!res.ok || !body.ok || !body.authorizeUrl) {
    return { ok: false, error: body.error ?? 'Failed to start Google OAuth' };
  }
  return { ok: true, authorizeUrl: body.authorizeUrl };
}

export type DisconnectGoogleResult = { ok: true } | { ok: false; error: string };

export async function disconnectGoogleWorkspace(): Promise<DisconnectGoogleResult> {
  const token = await staffBearer();
  if (!token) return { ok: false, error: 'Not signed in' };

  const res = await fetch('/api/staff/google/disconnect', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !body.ok) {
    return { ok: false, error: body.error ?? 'Failed to disconnect Google Workspace' };
  }
  return { ok: true };
}
