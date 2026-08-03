import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type SuggestFollowUpsResult =
  | { ok: true; status: number; summary: string; followUps: string[] }
  | { ok: false; status: number; error: string };

export async function suggestFollowUps(
  prospectId: number,
  limit?: number,
): Promise<SuggestFollowUpsResult> {
  if (!Number.isFinite(prospectId) || !Number.isInteger(prospectId) || prospectId < 1) {
    return { ok: false, status: 400, error: 'prospectId must be a positive integer' };
  }

  const body: { prospect_id: number; limit?: number } = { prospect_id: prospectId };
  if (limit != null) body.limit = limit;

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
    summary?: string;
    followUps?: string[];
  }>('suggest-follow-ups', { body });

  if (!error) {
    if (data?.ok && typeof data.summary === 'string') {
      const followUps = Array.isArray(data.followUps)
        ? data.followUps.filter((s): s is string => typeof s === 'string')
        : [];
      return { ok: true, status: 200, summary: data.summary, followUps };
    }
    return {
      ok: false,
      status: 500,
      error: data?.error ?? 'Unexpected suggest-follow-ups response',
    };
  }

  if (error instanceof FunctionsHttpError) {
    const status = error.context.status;
    let message = error.message;
    try {
      const errBody = (await error.context.json()) as { error?: string };
      if (errBody?.error) message = errBody.error;
    } catch {
      // keep FunctionsHttpError message
    }
    return { ok: false, status, error: message };
  }

  return { ok: false, status: 0, error: error.message };
}
