import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { getOutreachGoalSettings, updateOutreachGoalSettings } from '@/lib/outreachGoals';
import { parseOptionalSalesLineId, resolveSalesLineQuery } from '@/lib/resolveSalesLineQuery';
import { isMultiLineWritesEnabled } from '@/lib/staffFeatures';
import type { Database } from '@/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';

export const prerender = false;

type Client = SupabaseClient<Database>;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function resolveGoalSalesLineId(
  client: Client,
  raw: string | null,
): Promise<
  { ok: true; salesLineId: string | null } | { ok: false; status: 400 | 404; error: string }
> {
  const resolved = await resolveSalesLineQuery(client, raw);
  if (!resolved.ok) return resolved;
  if (!resolved.line) return { ok: true, salesLineId: null };

  const { data, error } = await client
    .from('lines')
    .select('id, code, status')
    .eq('id', resolved.line.id)
    .maybeSingle();
  if (error) return { ok: false, status: 400, error: error.message };
  if (!data) return { ok: false, status: 404, error: 'Unknown sales line' };
  if (
    data.code === 'bkg' ||
    data.status === 'prospective' ||
    data.status === 'declined' ||
    data.status === 'terminated'
  ) {
    return { ok: false, status: 404, error: 'Unknown sales line' };
  }
  return { ok: true, salesLineId: data.id };
}

export const GET: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const writesEnabled = isMultiLineWritesEnabled();
  const resolved = await resolveGoalSalesLineId(
    gate.supabase,
    parseOptionalSalesLineId(url.searchParams.get('sales_line_id')),
  );
  if (!resolved.ok) {
    return json({ ok: false, error: resolved.error }, resolved.status);
  }

  const result = await getOutreachGoalSettings(gate.supabase, {
    writesEnabled,
    salesLineId: writesEnabled ? resolved.salesLineId : null,
  });
  if (!result.ok) {
    return json({ ok: false, error: result.error }, 500);
  }

  return json({ ok: true, settings: result.settings });
};

export const PATCH: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const writesEnabled = isMultiLineWritesEnabled();
  const resolved = await resolveGoalSalesLineId(
    gate.supabase,
    parseOptionalSalesLineId(body.sales_line_id) ?? parseOptionalSalesLineId(body.salesLineId),
  );
  if (!resolved.ok) {
    return json({ ok: false, error: resolved.error }, resolved.status);
  }

  const result = await updateOutreachGoalSettings(
    {
      monthlyTarget: typeof body.monthlyTarget === 'number' ? body.monthlyTarget : undefined,
      planningConversionRate:
        typeof body.planningConversionRate === 'number' ? body.planningConversionRate : undefined,
      businessTimezone:
        typeof body.businessTimezone === 'string' ? body.businessTimezone : undefined,
      updatedBy: gate.userId,
      writesEnabled,
      salesLineId: writesEnabled ? resolved.salesLineId : null,
    },
    gate.supabase,
  );

  if (!result.ok) {
    return json({ ok: false, error: result.error }, 400);
  }

  return json({ ok: true, settings: result.settings });
};
