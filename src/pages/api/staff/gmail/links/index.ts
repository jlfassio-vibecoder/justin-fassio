import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import {
  listConfirmedLinksForProspect,
  GmailThreadLinkError,
  toPublicGmailThreadLink,
} from '@/lib/google/gmailThreadLinks';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** List confirmed Gmail thread links for a prospect/account drawer. */
export const GET: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const prospectRaw = url.searchParams.get('prospectId');
  const prospectId = prospectRaw ? Number(prospectRaw) : NaN;
  if (!Number.isFinite(prospectId) || prospectId <= 0) {
    return json({ ok: false, error: 'prospectId is required' }, 400);
  }

  try {
    const rows = await listConfirmedLinksForProspect({
      client: gate.supabase,
      prospectId,
    });
    return json({
      ok: true,
      links: rows.map(toPublicGmailThreadLink),
    });
  } catch (err) {
    if (err instanceof GmailThreadLinkError) {
      return json({ ok: false, error: err.message }, 500);
    }
    console.error('[gmail]', { workflow: 'list_links', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to load Gmail links' }, 500);
  }
};
