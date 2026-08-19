import type { APIRoute } from 'astro';
import { gateLookalikeOgrLine, jsonLookalike, requireLookalikeOwner } from '@/lib/lookalike/http';
import { listLookalikeSeeds } from '@/lib/lookalike/jobs';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const owner = await requireLookalikeOwner(request);
  if (!owner.ok) return owner.response;
  const salesLineId = new URL(request.url).searchParams.get('sales_line_id');
  const line = await gateLookalikeOgrLine(owner.supabase, salesLineId);
  if (!line.ok) return line.response;

  const result = await listLookalikeSeeds(owner.supabase, line.salesLineId);
  if (!result.ok) return jsonLookalike({ ok: false, error: result.error }, result.status);
  return jsonLookalike({ ok: true, seeds: result.seeds });
};
