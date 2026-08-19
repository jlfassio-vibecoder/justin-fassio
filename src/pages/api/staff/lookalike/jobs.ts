import type { APIRoute } from 'astro';
import {
  gateLookalikeOgrLine,
  jsonLookalike,
  parseLookalikeJson,
  requireLookalikeOwner,
} from '@/lib/lookalike/http';
import { startLookalikeJob } from '@/lib/lookalike/jobs';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const owner = await requireLookalikeOwner(request);
  if (!owner.ok) return owner.response;
  const parsed = await parseLookalikeJson(request);
  if (!parsed.ok) return parsed.response;

  const line = await gateLookalikeOgrLine(owner.supabase, parsed.body.sales_line_id);
  if (!line.ok) return line.response;

  const result = await startLookalikeJob(owner.supabase, owner.userId, {
    salesLineId: line.salesLineId,
    seedRetailerIds: parsed.body.seed_retailer_ids,
  });
  if (!result.ok) return jsonLookalike({ ok: false, error: result.error }, result.status);
  return jsonLookalike({ ok: true, snapshot: result.snapshot });
};
