import type { APIRoute } from 'astro';
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { createAgentCrmTools } from '@/lib/agentCrmTools';
import { objectionCatalogBlurb } from '@/lib/objectionCatalog';

export const prerender = false;

const SYSTEM_PROMPT = [
  'You are a concise coach for a BC wholesale apparel sales rep (Old Guys Rule). Help with objections, follow-ups, call drafts, and prospect summaries. Do not invent store facts.',
  "Use getProspectSummary and listRecentCalls when the user names a prospect id or asks about a store's call history. Do not invent CRM facts.",
  `When the user asks about buyer feedback or objections, give 2-3 short talk tracks. Prefer logged objection_tags from listRecentCalls when a prospect id is present. Known catalog tags: ${objectionCatalogBlurb()}. Do not invent other tag names.`,
  'When asked for a follow-up email or call script after a logged outcome, draft that artifact only (email: subject + body; script: 30–60s talk track). Use tools for prospect/call facts; do not invent store details; keep under ~200 words.',
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

  let body: { messages?: unknown };
  try {
    body = (await request.json()) as { messages?: unknown };
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  if (!isUIMessageArray(body.messages)) {
    return jsonError('Provide messages', 400);
  }

  const tools = createAgentCrmTools(gate.supabase);
  const modelMessages = convertToModelMessages(body.messages);

  // Model strings like openai/gpt-4o route through Vercel AI Gateway (OIDC on Vercel; AI_GATEWAY_API_KEY locally).
  const result = streamText({
    model: 'openai/gpt-4o',
    system: SYSTEM_PROMPT,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(5),
    maxOutputTokens: 800,
  });

  return result.toUIMessageStreamResponse();
};
