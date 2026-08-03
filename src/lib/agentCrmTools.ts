import { tool } from 'ai';
import { z } from 'zod';
import type { AgentSupabase } from '@/lib/agentAuth';
import { computeReorderSuggestion } from '@/lib/reorderCadence';
import type { ApparelSeason } from '@/types/database';

const NOTES_MAX = 240;
const DEFAULT_CALL_LIMIT = 12;
const MIN_CALL_LIMIT = 1;
const MAX_CALL_LIMIT = 20;
const DEFAULT_LINE_CODE = 'ogr';
const CATALOG_ANCHOR_LIMIT = 12;

const CALL_SELECT =
  'call_date,outcome,contact_name,pmf_score,order_value_cad,notes,objection_tags,follow_up_date';

const PROSPECT_SELECT = 'id,name,category,region,city,fit,account_status';

const ORDER_SELECT_FOR_REORDER = 'order_date,season,total_amount_cad,order_type,status';

const REORDER_SETTINGS_SELECT =
  'account_id,last_order_date,next_suggested_contact_date,seasonal_cadence_tags,ai_reorder_notes';

const ORDER_HISTORY_LIMIT = 10;

const CATALOG_ANCHOR_SELECT = 'sku,name,cat,color,tagline,is_new,is_name_drop,msrp_cad,page';

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
          .select(PROSPECT_SELECT)
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

    getAccountProductFit: tool({
      description:
        'Load account-product-fit grounding for a prospect: store metadata plus a capped set of catalog anchors for a product line (default Old Guys Rule / ogr). Use for APF briefs and walk-in pitch scripts. Does not score fit — the model scores from this data.',
      inputSchema: z.object({
        prospectId: z.number().int().positive().describe('Prospect id (positive integer)'),
        lineCode: z
          .string()
          .min(1)
          .optional()
          .describe(`Product line code (default ${DEFAULT_LINE_CODE})`),
      }),
      execute: async ({ prospectId, lineCode }) => {
        const code = (lineCode?.trim() || DEFAULT_LINE_CODE).toLowerCase();

        const { data: prospect, error: prospectError } = await supabase
          .from('prospects')
          .select(PROSPECT_SELECT)
          .eq('id', prospectId)
          .maybeSingle();

        if (prospectError) {
          return { error: prospectError.message };
        }
        if (!prospect) {
          return { error: 'Prospect not found' };
        }

        const { data: line, error: lineError } = await supabase
          .from('lines')
          .select('id,code,name')
          .eq('code', code)
          .maybeSingle();

        if (lineError) {
          return { error: lineError.message };
        }
        if (!line) {
          return { error: `Line not found for code "${code}"` };
        }

        const { data: items, error: itemsError } = await supabase
          .from('catalog_items')
          .select(CATALOG_ANCHOR_SELECT)
          .eq('line_id', line.id)
          .order('is_name_drop', { ascending: false })
          .order('is_new', { ascending: false })
          .order('page', { ascending: true })
          .limit(CATALOG_ANCHOR_LIMIT);

        if (itemsError) {
          return { error: itemsError.message };
        }

        return {
          prospect,
          line,
          catalogAnchors: items ?? [],
        };
      },
    }),

    getReorderSuggestions: tool({
      description:
        'Compute seasonal reorder contact timing and a short outreach pitch for an active account (or prospect id). Persists next_suggested_contact_date and ai_reorder_notes. Use for reorder timing / outreach pitches.',
      inputSchema: z.object({
        accountId: z.number().int().positive().describe('Account / prospect id (positive integer)'),
      }),
      execute: async ({ accountId }) => {
        const { data: prospect, error: prospectError } = await supabase
          .from('prospects')
          .select(PROSPECT_SELECT)
          .eq('id', accountId)
          .maybeSingle();

        if (prospectError) {
          return { error: prospectError.message };
        }
        if (!prospect) {
          return { error: 'Account not found' };
        }

        const { data: orders, error: ordersError } = await supabase
          .from('orders')
          .select(ORDER_SELECT_FOR_REORDER)
          .eq('account_id', accountId)
          .order('order_date', { ascending: false })
          .limit(ORDER_HISTORY_LIMIT);

        if (ordersError) {
          return { error: ordersError.message };
        }

        const { data: settings, error: settingsError } = await supabase
          .from('account_reorder_settings')
          .select(REORDER_SETTINGS_SELECT)
          .eq('account_id', accountId)
          .maybeSingle();

        if (settingsError) {
          return { error: settingsError.message };
        }

        const latestOrder = orders?.[0] ?? null;
        const lastOrderDate = settings?.last_order_date ?? latestOrder?.order_date ?? null;
        const lastSeason = (latestOrder?.season as ApparelSeason | undefined) ?? null;

        const suggestion = computeReorderSuggestion({
          lastOrderDate,
          lastSeason,
          accountName: prospect.name,
        });

        const { error: upsertError } = await supabase.from('account_reorder_settings').upsert(
          {
            account_id: accountId,
            last_order_date: lastOrderDate,
            next_suggested_contact_date: suggestion.nextSuggestedContactDate,
            seasonal_cadence_tags: suggestion.seasonalCadenceTags,
            ai_reorder_notes: suggestion.aiReorderNotes,
          },
          { onConflict: 'account_id' },
        );

        if (upsertError) {
          return { error: upsertError.message };
        }

        return {
          nextSuggestedContactDate: suggestion.nextSuggestedContactDate,
          aiReorderNotes: suggestion.aiReorderNotes,
          seasonalCadenceTags: suggestion.seasonalCadenceTags,
          lastOrderDate,
        };
      },
    }),
  };
}

export type AgentCrmTools = ReturnType<typeof createAgentCrmTools>;
