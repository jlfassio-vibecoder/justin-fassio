import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type ServerPingResult = {
  ok: boolean;
  status: number;
  error?: string;
};

export async function pingAuthorizedServer(): Promise<ServerPingResult> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
    'authorized-ping',
    { method: 'POST' },
  );

  if (!error) {
    if (data?.ok) {
      return { ok: true, status: 200 };
    }
    return { ok: false, status: 500, error: data?.error ?? 'Unexpected ping response' };
  }

  if (error instanceof FunctionsHttpError) {
    const status = error.context.status;
    let message = error.message;
    try {
      const body = (await error.context.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // keep FunctionsHttpError message
    }
    return { ok: false, status, error: message };
  }

  return { ok: false, status: 0, error: error.message };
}
