import type { APIRoute } from 'astro';
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { createAgentCrmTools } from '@/lib/agentCrmTools';
import { checkAgentRateLimit, rateLimitResponse } from '@/lib/agentRateLimit';
import {
  aiGatewayUserErrorMessage,
  hasAiGatewayAuth,
  LOCAL_AI_GATEWAY_AUTH_HELP,
  staffGatewayModel,
} from '@/lib/aiGatewayEnv';
import {
  gateStaffAiContext,
  parseOptionalPositiveInt,
  parseOptionalUuidField,
} from '@/lib/aiLineContext';
import { objectionCatalogBlurb } from '@/lib/objectionCatalog';

export const prerender = false;

const SYSTEM_PROMPT = [
  'You are a concise coach for a BC wholesale apparel sales rep (Old Guys Rule). Help with objections, follow-ups, call drafts, prospect summaries, and account-product-fit briefs. Do not invent store facts.',
  "Use getProspectSummary and listRecentCalls when the user names a prospect id or asks about a store's call history. Do not invent CRM facts.",
  'Use getAccountProductFit when the user asks for an APF brief, fit score, background summary, or initial call/walk-in pitch script. It returns prospect metadata plus catalog anchors — do not invent SKUs or store facts.',
  'Use getReorderSuggestions for reorder timing, seasonal contact dates, or outreach pitches on an account; prefer the returned nextSuggestedContactDate and aiReorderNotes over inventing cadence.',
  `When the user asks about buyer feedback or objections, give 2-3 short talk tracks. Prefer logged objection_tags from listRecentCalls when a prospect id is present. Known catalog tags: ${objectionCatalogBlurb()}. Do not invent other tag names.`,
  'When asked for a follow-up email or call script after a logged outcome, draft that artifact only (email: subject + body; script: 30–60s talk track). Use tools for prospect/call facts; do not invent store details; keep under ~200 words.',
  'When asked for prospect follow-up suggestions, use tools then reply with a brief summary plus a numbered action list (3–5 items); no invented CRM facts.',
  'When asked for an APF brief or walk-in pitch, call getAccountProductFit then reply in Markdown with: (1) Fit score (1–10) and 1–2 sentence rationale from category/region/fit vs catalog; (2) Background — 2–3 sentences on store positioning; (3) Initial call/walk-in script with Opener, Product Anchor (cite 1–2 real SKUs/names from catalogAnchors), and CTA. No invented CRM or catalog facts.',
].join(' ');

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isUIMessageArray(raw: unknown): raw is UIMessage[] {
  if (!Array.isArray(raw) || raw.length === 0) return false;
  return raw.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const role = (item as { role?: unknown }).role;
    return role === 'user' || role === 'assistant' || role === 'system';
  });
}

export const POST: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const limited = checkAgentRateLimit(gate.userId);
  if (!limited.ok) {
    return rateLimitResponse(limited.retryAfterSec);
  }

  let body: {
    messages?: unknown;
    salesLineId?: unknown;
    retailerLineAccountId?: unknown;
    prospectId?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  if (!isUIMessageArray(body.messages)) {
    return jsonError('Provide messages', 400);
  }

  const prospectId = parseOptionalPositiveInt(body.prospectId);
  const gated = await gateStaffAiContext({
    client: gate.supabase,
    salesLineId: parseOptionalUuidField(body.salesLineId),
    retailerLineAccountId: parseOptionalUuidField(body.retailerLineAccountId),
    prospectId,
    kind: prospectId != null ? 'account' : 'line_level',
  });
  if (!gated.ok) {
    return jsonError(gated.error, gated.status);
  }

  if (!hasAiGatewayAuth()) {
    return jsonError(LOCAL_AI_GATEWAY_AUTH_HELP, 503);
  }

  const tools = createAgentCrmTools(gate.supabase, gated.ctx ?? undefined);
  // AI SDK 6+: convertToModelMessages is async (supports async Tool.toModelOutput).
  const modelMessages = await convertToModelMessages(body.messages);

  const system = gated.ctx
    ? [
        gated.ctx.aiProfile.systemPrompt || gated.ctx.aiProfile.persona,
        gated.ctx.aiProfile.apfPrompt,
        `When the user asks about buyer feedback or objections, give 2-3 short talk tracks. Known catalog tags: ${objectionCatalogBlurb()}. Do not invent other tag names.`,
      ]
        .filter(Boolean)
        .join(' ')
    : SYSTEM_PROMPT;

  // Model strings like openai/gpt-4o route through Vercel AI Gateway (OIDC on Vercel; AI_GATEWAY_API_KEY locally).
  // Spend caps: stepCountIs(5) + maxOutputTokens; request rate: checkAgentRateLimit (per user, in-memory).
  const result = streamText({
    model: staffGatewayModel(),
    system,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(5),
    maxOutputTokens: 1100,
  });

  return result.toUIMessageStreamResponse({
    onError: aiGatewayUserErrorMessage,
  });
};
