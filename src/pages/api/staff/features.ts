import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { getStaffFeatureFlags } from '@/lib/staffFeatures';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  return new Response(JSON.stringify({ ok: true, features: getStaffFeatureFlags() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
