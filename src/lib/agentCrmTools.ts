import { tool } from 'ai';
import { z } from 'zod';
import type { AgentSupabase } from '@/lib/agentAuth';

const NOTES_MAX = 240;
const DEFAULT_CALL_LIMIT = 12;
const MIN_CALL_LIMIT = 1;
const MAX_CALL_LIMIT = 20;

const CALL_SELECT =
  'call_date,outcome,contact_name,pmf_score,order_value_cad,notes,objection_tags,follow_up_date';

/** Clamp listRecentCalls limit to 1–20 (default 12). */
export function clampCallLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return DEFAULT_CALL_LIMIT;
  return Math.min(MAX_CALL_LIMIT, Math.max(MIN_CALL_LIMIT, Math.floor(limit)));
}

/** Truncate call notes for model context (CRM tool reads). */
export function truncateNotes(notes: string | null | undefined, max = NOTES_MAX): string {
  const s = notes ?? '';
  return s.length <= max ? s : s.slice(0, max);
}

/**
 * AI SDK tools that read CRM rows under the caller's JWT + RLS.
 * No service role; no OpenAI keys — DB reads only.
 */
export function createAgentCrmTools(supabase: AgentSupabase) {
  return {
    getProspectSummary: tool({
      description:
        'Load a prospect summary by numeric id (name, category, region, city, fit). Use when the user names a prospect id or asks about a store.',
      inputSchema: z.object({
        prospectId: z.number().int().positive().describe('Prospect id (positive integer)'),
      }),
      execute: async ({ prospectId }) => {
        const { data, error } = await supabase
          .from('prospects')
          .select('id,name,category,region,city,fit')
          .eq('id', prospectId)
          .maybeSingle();

        if (error) {
          return { error: error.message };
        }
        if (!data) {
          return { error: 'Prospect not found' };
        }
        return data;
      },
    }),

    listRecentCalls: tool({
      description:
        'List recent calls for a prospect (newest first). Includes outcome, contact, PMF, notes (truncated), tags, and follow-up date.',
      inputSchema: z.object({
        prospectId: z.number().int().positive().describe('Prospect id (positive integer)'),
        limit: z
          .number()
          .int()
          .optional()
          .describe(
            `Max calls to return (${MIN_CALL_LIMIT}–${MAX_CALL_LIMIT}, default ${DEFAULT_CALL_LIMIT})`,
          ),
      }),
      execute: async ({ prospectId, limit }) => {
        const clamped = clampCallLimit(limit);
        const { data, error } = await supabase
          .from('calls')
          .select(CALL_SELECT)
          .eq('prospect_id', prospectId)
          .order('call_date', { ascending: false })
          .limit(clamped);

        if (error) {
          return { error: error.message };
        }

        return (data ?? []).map((row) => ({
          ...row,
          notes: truncateNotes(row.notes),
        }));
      },
    }),
  };
}

export type AgentCrmTools = ReturnType<typeof createAgentCrmTools>;
