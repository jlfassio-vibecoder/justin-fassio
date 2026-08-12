import { insertOrder } from '@/lib/orders';
import { upsertAccountReorderSettings } from '@/lib/accountReorderSettings';
import { recordConversionAttribution } from '@/lib/outreachAttribution';
import { formatLocalIsoDate } from '@/lib/reorderCadence';
import { supabase } from '@/lib/supabase';
import type { AccountStatus, ApparelSeason, ConversionSource } from '@/types/database';

export const CONVERSION_OUTCOMES = ['Closed PO / Written Order', 'Account Converted'] as const;

export type ConversionOutcome = (typeof CONVERSION_OUTCOMES)[number];

export function isConversionOutcome(outcome: string): boolean {
  return (CONVERSION_OUTCOMES as readonly string[]).includes(outcome);
}

export interface ConvertInitialOrderInput {
  season: ApparelSeason;
  totalAmountCad: number;
  notes?: string | null;
  /** YYYY-MM-DD; defaults to today (local). */
  orderDate?: string;
  lineId?: string | null;
}

export interface ConvertAttributionInput {
  conversionSource: ConversionSource;
  /** Staff-selected system_message id, or null for None. */
  staffSelectedMessageId?: string | null;
  forceNone?: boolean;
  convertedBy?: string | null;
}

export interface ConvertToActiveAccountInput {
  accountId: number;
  currentStatus: AccountStatus;
  initialOrder?: ConvertInitialOrderInput;
  attribution?: ConvertAttributionInput;
}

export type ConvertToActiveAccountResult =
  | { ok: true; alreadyActive: boolean; convertedAt?: string; attributionError?: string }
  | { ok: false; error: string };

function todayIsoDate(): string {
  return formatLocalIsoDate(new Date());
}

/**
 * Promote a prospect to active_account, optionally logging an initial order.
 * Sequential client writes (no DB transaction) — a mid-step failure may leave
 * the prospect updated without an order/settings/attribution row.
 */
export async function convertToActiveAccount(
  input: ConvertToActiveAccountInput,
): Promise<ConvertToActiveAccountResult> {
  if (input.currentStatus === 'active_account') {
    return { ok: true, alreadyActive: true };
  }

  const nowIso = new Date().toISOString();
  const orderDate = input.initialOrder?.orderDate ?? todayIsoDate();
  const hasOrder = input.initialOrder != null;

  // Copilot suggestion ignored: atomic RPC/rollback would add a new DB surface; sequential writes are intentional for this client flow.
  const { error: updateError } = await supabase
    .from('prospects')
    .update({
      account_status: 'active_account',
      converted_at: nowIso,
      initial_order_date: hasOrder ? `${orderDate}T12:00:00.000Z` : null,
    })
    .eq('id', input.accountId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  if (input.initialOrder) {
    const orderResult = await insertOrder({
      account_id: input.accountId,
      line_id: input.initialOrder.lineId ?? null,
      order_type: 'initial',
      season: input.initialOrder.season,
      order_date: orderDate,
      total_amount_cad: input.initialOrder.totalAmountCad,
      status: 'submitted',
      notes: input.initialOrder.notes ?? null,
    });

    if (orderResult.error) {
      return { ok: false, error: orderResult.error };
    }
  }

  const settingsResult = await upsertAccountReorderSettings({
    account_id: input.accountId,
    last_order_date: hasOrder ? orderDate : null,
  });

  if (settingsResult.error) {
    return { ok: false, error: settingsResult.error };
  }

  let attributionError: string | undefined;
  const attr = input.attribution ?? {
    conversionSource: 'manual' as const,
    staffSelectedMessageId: null,
  };
  const attrResult = await recordConversionAttribution({
    prospectId: input.accountId,
    convertedAt: nowIso,
    convertedBy: attr.convertedBy ?? null,
    conversionSource: attr.conversionSource,
    staffSelectedMessageId: attr.staffSelectedMessageId,
    forceNone: attr.forceNone,
  });
  if (!attrResult.ok) {
    attributionError = attrResult.error;
  }

  return { ok: true, alreadyActive: false, convertedAt: nowIso, attributionError };
}

export interface DemoteToProspectInput {
  accountId: number;
  currentStatus: AccountStatus;
}

export type DemoteToProspectResult =
  { ok: true; alreadyProspect: boolean } | { ok: false; error: string };

/**
 * Move an active account back to prospect status.
 * Keeps orders, contacts, and reorder settings on the same id; clears converted_at.
 */
export async function demoteToProspect(
  input: DemoteToProspectInput,
): Promise<DemoteToProspectResult> {
  if (input.currentStatus !== 'active_account') {
    return { ok: true, alreadyProspect: true };
  }

  const { error: updateError } = await supabase
    .from('prospects')
    .update({
      account_status: 'prospect',
      converted_at: null,
    })
    .eq('id', input.accountId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  return { ok: true, alreadyProspect: false };
}
