import type { APIRoute } from 'astro';
import { streamText, stepCountIs, type ModelMessage } from 'ai';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { createAgentCrmTools } from '@/lib/agentCrmTools';

export const prerender = false;

const SYSTEM_PROMPT =
  "You are a concise coach for a BC wholesale apparel sales rep (Old Guys Rule). Help with objections, follow-ups, call drafts, and prospect summaries. Do not invent store facts. Use getProspectSummary and listRecentCalls when the user names a prospect id or asks about a store's call history. Do not invent CRM facts.";

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function normalizeMessages(raw: unknown): ModelMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ModelMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (
      (role !== 'user' && role !== 'assistant' && role !== 'system') ||
      typeof content !== 'string'
    ) {
      return null;
    }
    out.push({ role, content });
  }
  return out;
}

export const POST: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  let body: { prompt?: unknown; messages?: unknown };
  try {
    body = (await request.json()) as { prompt?: unknown; messages?: unknown };
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const messages = normalizeMessages(body.messages);
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';

  if (!messages && !prompt) {
    return jsonError('Provide prompt or messages', 400);
  }

  const tools = createAgentCrmTools(gate.supabase);
  const shared = {
    model: 'openai/gpt-4o' as const,
    system: SYSTEM_PROMPT,
    tools,
    stopWhen: stepCountIs(5),
    maxOutputTokens: 800,
  };

  // AI SDK 5: toDataStreamResponse was replaced by toTextStreamResponse / toUIMessageStreamResponse.
  // Model strings like openai/gpt-4o route through Vercel AI Gateway (OIDC on Vercel; AI_GATEWAY_API_KEY locally).
  const result = messages ? streamText({ ...shared, messages }) : streamText({ ...shared, prompt });

  return result.toTextStreamResponse();
};
