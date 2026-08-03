import { jsonResponse } from '../_shared/cors.ts';
import { handleCorsOptions, requireApprovedStaff } from '../_shared/requireApprovedStaff.ts';

type SuggestBody = {
  prospect_id?: unknown;
  limit?: unknown;
};

type CallRow = {
  call_date: string;
  outcome: string;
  contact_name: string | null;
  pmf_score: number | null;
  order_value_cad: number | null;
  notes: string | null;
  objection_tags: string[] | null;
  follow_up_date: string | null;
};

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function parseProspectId(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  return n;
}

function clampLimit(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 12;
  if (!Number.isFinite(n)) return 12;
  return Math.min(20, Math.max(1, Math.floor(n)));
}

Deno.serve(async (req) => {
  const options = handleCorsOptions(req);
  if (options) return options;

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  const gate = await requireApprovedStaff(req);
  if (!gate.ok) return gate.response;

  let body: SuggestBody;
  try {
    body = (await req.json()) as SuggestBody;
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const prospectId = parseProspectId(body.prospect_id);
  if (prospectId == null) {
    return jsonResponse({ ok: false, error: 'prospect_id must be a positive integer' }, 400);
  }
  const limit = clampLimit(body.limit);

  const { data: prospect, error: prospectError } = await gate.supabase
    .from('prospects')
    .select('id,name,category,region,city,fit')
    .eq('id', prospectId)
    .maybeSingle();

  if (prospectError) {
    return jsonResponse({ ok: false, error: prospectError.message }, 500);
  }
  if (!prospect) {
    return jsonResponse({ ok: false, error: 'Prospect not found' }, 404);
  }

  const { data: calls, error: callsError } = await gate.supabase
    .from('calls')
    .select(
      'call_date,outcome,contact_name,pmf_score,order_value_cad,notes,objection_tags,follow_up_date',
    )
    .eq('prospect_id', prospectId)
    .order('call_date', { ascending: false })
    .limit(limit);

  if (callsError) {
    return jsonResponse({ ok: false, error: callsError.message }, 500);
  }

  const rows = (calls ?? []) as CallRow[];
  if (rows.length === 0) {
    return jsonResponse(
      {
        ok: true,
        summary: `No calls logged yet for ${prospect.name}. Log a call first, then re-run Suggest.`,
        followUps: [
          'Schedule an introductory call and capture outcome + PMF score.',
          'Confirm buyer contact name and best reorder window before pitching.',
        ],
      },
      200,
    );
  }

  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    return jsonResponse(
      { ok: false, error: 'OPENAI_API_KEY is not configured on the server' },
      500,
    );
  }

  const callLines = rows.map((c, i) => {
    const tags = (c.objection_tags ?? []).join(', ') || 'none';
    const notes = truncate(c.notes ?? '', 240);
    return [
      `${i + 1}. ${c.call_date} | ${c.outcome}`,
      `contact=${c.contact_name ?? '—'}; pmf=${c.pmf_score ?? '—'}; order_cad=${c.order_value_cad ?? 0}`,
      `follow_up=${c.follow_up_date ?? '—'}; tags=${tags}`,
      `notes=${notes || '—'}`,
    ].join('\n');
  });

  const userPrompt = [
    `Prospect: ${prospect.name} (${prospect.category}, ${prospect.city}, ${prospect.region})`,
    `Fit: ${truncate(prospect.fit ?? '', 400)}`,
    'Recent calls (newest first):',
    callLines.join('\n\n'),
    'Respond with JSON only: {"summary":"...","followUps":["...","..."]}',
    'Give 3-5 concrete next follow-up actions for a BC wholesale apparel rep.',
  ].join('\n\n');

  const llmRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 800,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a coach for a BC wholesale apparel rep selling Old Guys Rule to golf shops, marinas, hardware, and resort gift stores. Be concise and actionable. Never invent store facts not present in the call log.',
        },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!llmRes.ok) {
    const detail = truncate(await llmRes.text(), 200);
    return jsonResponse(
      { ok: false, error: `OpenAI request failed (${llmRes.status}): ${detail}` },
      502,
    );
  }

  const llmJson = (await llmRes.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = llmJson.choices?.[0]?.message?.content;
  if (!content) {
    return jsonResponse({ ok: false, error: 'Empty OpenAI response' }, 502);
  }

  let parsed: { summary?: unknown; followUps?: unknown };
  try {
    parsed = JSON.parse(content) as { summary?: unknown; followUps?: unknown };
  } catch {
    return jsonResponse({ ok: false, error: 'OpenAI returned non-JSON content' }, 502);
  }

  const summary =
    typeof parsed.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : 'Unable to produce a summary from the call history.';
  const followUps = Array.isArray(parsed.followUps)
    ? parsed.followUps
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .slice(0, 5)
    : [];

  return jsonResponse({ ok: true, summary, followUps }, 200);
});
