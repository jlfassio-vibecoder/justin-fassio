import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
// Copilot suggestion ignored: no tokenStore/connection filter — mirrors Gmail links list (prospect-scoped CRM cache).
import {
  CalendarEventLinkError,
  listConfirmedCalendarLinksForProspect,
  toPublicCalendarEventLink,
} from '@/lib/google/calendarEventLinks';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** List confirmed Calendar event links for a prospect/account drawer. */
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
    // Copilot suggestion ignored: do not scope by google_connection_id; same prospect-wide list as Gmail drawers.
    const rows = await listConfirmedCalendarLinksForProspect({
      client: gate.supabase,
      prospectId,
    });
    return json({
      ok: true,
      links: rows.map(toPublicCalendarEventLink),
    });
  } catch (err) {
    if (err instanceof CalendarEventLinkError) {
      return json({ ok: false, error: err.message }, 500);
    }
    console.error('[calendar]', { workflow: 'list_links', error: 'unexpected' });
    return json({ ok: false, error: 'Failed to load calendar links' }, 500);
  }
};
