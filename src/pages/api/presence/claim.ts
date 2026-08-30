import type { APIRoute } from 'astro';
import {
  PRESENCE_CLAIM_TTL_MS,
  PRESENCE_COOKIE_NAME,
  verifyPresenceVisitToken,
} from '@/lib/presenceVisitToken';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Exchange a signed outreach `vt` for a first-party presence cookie.
 * Public endpoint — no staff auth.
 */
export const POST: APIRoute = async ({ request }) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }
  const vt =
    raw && typeof raw === 'object' && typeof (raw as { vt?: unknown }).vt === 'string'
      ? (raw as { vt: string }).vt.trim()
      : '';
  if (!vt) return json({ ok: false, error: 'vt is required' }, 400);

  const verified = verifyPresenceVisitToken(vt);
  if (!verified.ok) return json({ ok: false, error: verified.error }, 400);

  const maxAgeSec = Math.floor(PRESENCE_CLAIM_TTL_MS / 1000);
  const secure = new URL(request.url).protocol === 'https:';
  const cookie = [
    `${PRESENCE_COOKIE_NAME}=${encodeURIComponent(vt)}`,
    'Path=/',
    `Max-Age=${maxAgeSec}`,
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');

  return new Response(JSON.stringify({ ok: true, prospectId: verified.payload.prospectId }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookie,
    },
  });
};
