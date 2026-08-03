import type { APIRoute } from 'astro';
import { streamText, type ModelMessage } from 'ai';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export const prerender = false;

const SYSTEM_PROMPT =
  'You are a concise coach for a BC wholesale apparel sales rep (Old Guys Rule). Help with objections, follow-ups, call drafts, and prospect summaries. Do not invent store facts.';

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function requireApprovedStaff(request: Request): Promise<Response | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonError('Missing bearer token', 401);
  }

  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonError('Server misconfigured', 500);
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return jsonError('Unauthorized', 401);
  }

  const { data: approved, error: rpcError } = await supabase.rpc('is_approved_staff');
  if (rpcError) {
    return jsonError(rpcError.message, 500);
  }
  if (!approved) {
    return jsonError('Forbidden', 403);
  }

  return null;
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
  const authError = await requireApprovedStaff(request);
  if (authError) return authError;

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

  // AI SDK 5: toDataStreamResponse was replaced by toTextStreamResponse / toUIMessageStreamResponse.
  // Model strings like openai/gpt-4o route through Vercel AI Gateway (OIDC on Vercel; AI_GATEWAY_API_KEY locally).
  const result = messages
    ? streamText({
        model: 'openai/gpt-4o',
        system: SYSTEM_PROMPT,
        messages,
      })
    : streamText({
        model: 'openai/gpt-4o',
        system: SYSTEM_PROMPT,
        prompt,
      });

  return result.toTextStreamResponse();
};
