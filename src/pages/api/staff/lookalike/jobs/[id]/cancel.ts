import type { APIRoute } from 'astro';
import { jsonLookalike, parseLookalikeJson, requireLookalikeJob } from '@/lib/lookalike/http';
import { cancelLookalikeJob } from '@/lib/lookalike/jobs';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const parsed = await parseLookalikeJson(request);
  if (!parsed.ok) return parsed.response;
  const gate = await requireLookalikeJob(request, params, parsed.body.sales_line_id);
  if (!gate.ok) return gate.response;

  const result = await cancelLookalikeJob(gate.supabase, gate.jobId);
  if (!result.ok) return jsonLookalike({ ok: false, error: result.error }, result.status);
  return jsonLookalike({ ok: true, snapshot: result.snapshot });
};
