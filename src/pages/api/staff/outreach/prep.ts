import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { getOutreachGoalSettings } from '@/lib/outreachGoals';
import { defaultNightlyPrepRunDate, runOutreachNightlyPrep } from '@/lib/outreachNightlyPrep';
import { formatOutreachPreparationDate } from '@/lib/outreachSelectTargets';
import { isWeekdayIso } from '@/lib/outreachSellingDays';

export const prerender = false;
export const maxDuration = 300;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const goals = await getOutreachGoalSettings(gate.supabase);
  if (!goals.ok) return json({ error: goals.error }, 500);
  const timeZone = goals.settings.businessTimezone;
  const asOf = new Date();
  const today = formatOutreachPreparationDate(asOf, timeZone);

  let preparationDate: string | undefined;
  const raw = typeof body.preparationDate === 'string' ? body.preparationDate.trim() : '';
  if (raw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return json({ error: 'preparationDate must be YYYY-MM-DD' }, 400);
    }
    // Catch-up today only when today is a selling day
    if (raw === today && !isWeekdayIso(today)) {
      return json({ error: 'Today is not a selling day' }, 400);
    }
    preparationDate = raw;
  } else {
    preparationDate = defaultNightlyPrepRunDate(asOf, timeZone);
  }

  const result = await runOutreachNightlyPrep({
    client: gate.supabase,
    trigger: 'manual',
    triggeredBy: gate.userId,
    preparationDate,
    asOf,
  });

  if (!result.ok) {
    return json({ error: result.error, run: result.run ?? null }, result.status ?? 500);
  }

  return json({ ok: true, noop: result.noop, run: result.run });
};
