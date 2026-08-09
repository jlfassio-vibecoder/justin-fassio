import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { revokeGoogleToken } from '@/lib/google/oauth';
import { deleteGoogleConnection } from '@/lib/google/tokenStore';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const admin = getServiceRoleClient();
  if (!admin) {
    return json({ ok: false, error: 'Server misconfigured' }, 500);
  }

  try {
    const { deleted, refreshToken } = await deleteGoogleConnection(gate.userId, admin);
    if (refreshToken) {
      await revokeGoogleToken({ token: refreshToken });
    }
    return json({ ok: true, disconnected: deleted });
  } catch (err) {
    console.error('[googleOAuth]', { workflow: 'disconnect', error: 'disconnect_failed' });
    const message = err instanceof Error ? err.message : 'Failed to disconnect';
    return json({ ok: false, error: message }, 500);
  }
};
