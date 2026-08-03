import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export type AgentSupabase = SupabaseClient<Database>;

export type ApprovedStaffClientResult =
  { ok: true; supabase: AgentSupabase } | { ok: false; response: Response };

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Gate for /api/agent: Bearer JWT → getUser → is_approved_staff.
 * On success returns a user-scoped Supabase client (RLS applies).
 */
export async function requireApprovedStaffClient(
  request: Request,
): Promise<ApprovedStaffClientResult> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, response: jsonError('Missing bearer token', 401) };
  }

  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, response: jsonError('Server misconfigured', 500) };
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
    return { ok: false, response: jsonError('Unauthorized', 401) };
  }

  const { data: approved, error: rpcError } = await supabase.rpc('is_approved_staff');
  if (rpcError) {
    return { ok: false, response: jsonError(rpcError.message, 500) };
  }
  if (!approved) {
    return { ok: false, response: jsonError('Forbidden', 403) };
  }

  return { ok: true, supabase };
}
