import type { APIRoute } from 'astro';
import { requireCronSecret } from '@/lib/cronAuth';
import { runOutreachNightlyPrep } from '@/lib/outreachNightlyPrep';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';

export const prerender = false;
export const maxDuration = 300;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handle(request: Request): Promise<Response> {
  const auth = requireCronSecret(request);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status);
  }

  const client = getServiceRoleClient();
  if (!client) {
    return json({ error: 'Service role client is not configured' }, 503);
  }

  const result = await runOutreachNightlyPrep({
    client,
    trigger: 'cron',
    triggeredBy: null,
  });

  if (!result.ok) {
    return json({ error: result.error, run: result.run ?? null }, result.status ?? 500);
  }

  return json({ ok: true, noop: result.noop, run: result.run });
}

/** Vercel Cron invokes GET by default; accept POST as well. */
export const GET: APIRoute = async ({ request }) => handle(request);
export const POST: APIRoute = async ({ request }) => handle(request);
