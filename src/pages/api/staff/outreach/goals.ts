import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { getOutreachGoalSettings, updateOutreachGoalSettings } from '@/lib/outreachGoals';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const result = await getOutreachGoalSettings(gate.supabase);
  if (!result.ok) {
    return new Response(JSON.stringify({ ok: false, error: result.error }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, settings: result.settings }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PATCH: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await updateOutreachGoalSettings(
    {
      monthlyTarget: typeof body.monthlyTarget === 'number' ? body.monthlyTarget : undefined,
      planningConversionRate:
        typeof body.planningConversionRate === 'number' ? body.planningConversionRate : undefined,
      businessTimezone:
        typeof body.businessTimezone === 'string' ? body.businessTimezone : undefined,
      updatedBy: gate.userId,
    },
    gate.supabase,
  );

  if (!result.ok) {
    return new Response(JSON.stringify({ ok: false, error: result.error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, settings: result.settings }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
