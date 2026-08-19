import type { APIRoute } from 'astro';
import { jsonLookalike, requireLookalikeJob } from '@/lib/lookalike/http';
import { getLookalikeJob } from '@/lib/lookalike/jobs';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const gate = await requireLookalikeJob(
    request,
    params,
    new URL(request.url).searchParams.get('sales_line_id'),
  );
  if (!gate.ok) return gate.response;

  const result = await getLookalikeJob(gate.supabase, gate.jobId);
  if (!result.ok) return jsonLookalike({ ok: false, error: result.error }, result.status);
  return jsonLookalike({ ok: true, snapshot: result.snapshot });
};
