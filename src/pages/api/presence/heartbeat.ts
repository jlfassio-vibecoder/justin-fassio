import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { PRESENCE_COOKIE_NAME, verifyPresenceVisitToken } from '@/lib/presenceVisitToken';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return rest.join('=') || null;
      }
    }
  }
  return null;
}

async function resolveProspectFromBuyerBearer(
  request: Request,
): Promise<{ prospectId: number } | null> {
  const auth = request.headers.get('authorization');
  if (!auth?.toLowerCase().startsWith('bearer ')) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const anon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const client = createClient<Database>(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await client.auth.getUser();
  if (userErr || !userData.user) return null;
  const { data: profile } = await client
    .from('profiles')
    .select('prospect_id, role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (
    profile &&
    profile.role === 'buyer' &&
    typeof profile.prospect_id === 'number' &&
    Number.isFinite(profile.prospect_id)
  ) {
    return { prospectId: profile.prospect_id };
  }
  return null;
}

/**
 * Upsert prospect_site_presence from cookie claim and/or buyer session.
 * Public endpoint — writes via service role after verifying identity.
 */
export const POST: APIRoute = async ({ request }) => {
  const admin = getServiceRoleClient();
  if (!admin) {
    return json({ ok: false, error: 'Presence is not configured' }, 503);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }
  const pathRaw =
    raw && typeof raw === 'object' && typeof (raw as { path?: unknown }).path === 'string'
      ? (raw as { path: string }).path.trim()
      : '';
  const path = pathRaw.slice(0, 500) || '/';

  // Never accept heartbeats that claim to be on staff surfaces.
  if (path === '/app' || path.startsWith('/app/') || path === '/rep-login') {
    return json({ ok: false, error: 'Staff surfaces are not tracked' }, 400);
  }

  let prospectId: number | null = null;
  let systemMessageId: string | null = null;

  const cookieVt = readCookie(request, PRESENCE_COOKIE_NAME);
  if (cookieVt) {
    const verified = verifyPresenceVisitToken(cookieVt);
    if (verified.ok) {
      prospectId = verified.payload.prospectId;
      systemMessageId = verified.payload.systemMessageId;
    }
  }

  if (prospectId == null) {
    const buyer = await resolveProspectFromBuyerBearer(request);
    if (buyer) prospectId = buyer.prospectId;
  }

  if (prospectId == null) {
    return json({ ok: true, tracked: false });
  }

  const nowIso = new Date().toISOString();
  const { error } = await admin.from('prospect_site_presence').upsert(
    {
      prospect_id: prospectId,
      last_seen_at: nowIso,
      last_path: path,
      system_message_id: systemMessageId,
      updated_at: nowIso,
    },
    { onConflict: 'prospect_id' },
  );

  if (error) return json({ ok: false, error: error.message }, 502);
  return json({ ok: true, tracked: true, prospectId, lastSeenAt: nowIso });
};
