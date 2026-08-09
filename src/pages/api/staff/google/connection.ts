import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import {
  assertNoSecretsInPublic,
  loadConnectionForProfile,
  toPublicConnection,
} from '@/lib/google/tokenStore';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const admin = getServiceRoleClient();
  if (!admin) {
    return json({ ok: false, error: 'Server misconfigured' }, 500);
  }

  try {
    const row = await loadConnectionForProfile(gate.userId, admin);
    const connection = toPublicConnection(row);
    assertNoSecretsInPublic(connection);
    return json({ ok: true, connection });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load connection';
    console.error('[googleOAuth]', { workflow: 'connection', error: 'load_failed' });
    return json({ ok: false, error: message }, 500);
  }
};
