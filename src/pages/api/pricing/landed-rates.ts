import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';

export const prerender = false;

/**
 * Phase II stub: auth gate only. Phase III replaces the body with web research.
 */
export const POST: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  return new Response(
    JSON.stringify({
      ok: false,
      error: 'Landed rates research is not available yet',
    }),
    {
      status: 501,
      headers: { 'Content-Type': 'application/json' },
    },
  );
};
