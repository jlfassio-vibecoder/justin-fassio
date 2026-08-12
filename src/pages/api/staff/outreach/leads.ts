import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import {
  listCallToday,
  listHotLeads,
  listWarmLeads,
  type OutreachLeadKind,
} from '@/lib/outreachLeadLists';

export const prerender = false;

function parseKind(raw: string | null): OutreachLeadKind | null {
  if (raw === 'warm' || raw === 'hot' || raw === 'call_today') return raw;
  return null;
}

export const GET: APIRoute = async ({ request, url }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const kind = parseKind(url.searchParams.get('kind'));
  if (!kind) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Query kind is required and must be one of: call_today, warm, hot',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const leads =
      kind === 'warm'
        ? await listWarmLeads(gate.supabase)
        : kind === 'hot'
          ? await listHotLeads(gate.supabase)
          : await listCallToday(gate.supabase);

    return new Response(JSON.stringify({ ok: true, kind, leads }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list outreach leads';
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
