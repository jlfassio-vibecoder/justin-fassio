import { insertOrder } from '@/lib/orders';
import { assertProspectiveOperationalWriteForbidden } from '@/lib/prospectiveLines';
import { upsertAccountReorderSettings } from '@/lib/accountReorderSettings';
import { recordConversionAttribution } from '@/lib/outreachAttribution';
import { formatLocalIsoDate } from '@/lib/reorderCadence';
import {
  ensureRetailerLineAccount,
  fetchLineWriteMeta,
  fetchOperationalLineAccount,
  updateRetailerLineAccountStatus,
} from '@/lib/retailerLineAccounts';
import { resolveWriteSalesLineId } from '@/lib/lines';
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
  originalAmountUsd?: number;
  exchangeRate?: number;
  exchangeRateDate?: string;
  fxConversionSource?: string;
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
  writesEnabled?: boolean;
  salesLineId?: string | null;
  eaglePeakSellingEnabled?: boolean;
  bigFishSellingEnabled?: boolean;
}

export type ConvertToActiveAccountResult =
  | { ok: true; alreadyActive: boolean; convertedAt?: string; attributionError?: string }
  | { ok: false; error: string };

function todayIsoDate(): string {
  return formatLocalIsoDate(new Date());
}

/**
 * Promote a prospect to opened on the current (or OGR-fallback) line account.
 * Sequential client writes (no DB transaction) — a mid-step failure may leave
 * the line account updated without an order/settings/attribution row.
 * Does not write prospects.account_status / converted_at / initial_order_date.
 */
export async function convertToActiveAccount(
  input: ConvertToActiveAccountInput,
): Promise<ConvertToActiveAccountResult> {
  const salesLineId = await resolveWriteSalesLineId(input.salesLineId);
  if (!salesLineId) {
    return { ok: false, error: 'OGR sales line not found' };
  }

  const ensured = await ensureRetailerLineAccount({
    retailerId: input.accountId,
    salesLineId,
    eaglePeakSellingEnabled: input.eaglePeakSellingEnabled,
    bigFishSellingEnabled: input.bigFishSellingEnabled,
  });
  if (ensured.gate === 'reject' || ensured.error || !ensured.data) {
    return {
      ok: false,
      error: ensured.error ?? 'Operational writes are not allowed for this line',
    };
  }
  if (ensured.data.relationshipStatus === 'opened') {
    return { ok: true, alreadyActive: true };
  }

  const line = await fetchLineWriteMeta(salesLineId);
  if (line.error || !line.data) {
    return { ok: false, error: line.error ?? 'Sales line not found' };
  }
  const prospectiveRefuse = assertProspectiveOperationalWriteForbidden(line.data.status);
  if (prospectiveRefuse) {
    return { ok: false, error: prospectiveRefuse };
  }
  const isOgr = line.data.code === 'ogr';
  if (line.data.code === 'eagle-peak' && !input.eaglePeakSellingEnabled) {
    return { ok: false, error: 'Eagle Peak selling is not enabled' };
  }
  if (line.data.code === 'big-fish' && !input.bigFishSellingEnabled) {
    return { ok: false, error: 'Big Fish selling is not enabled' };
  }
  if (line.data.code === 'big-fish') {
    const currency =
      typeof line.data.defaultCurrency === 'string' ? line.data.defaultCurrency.trim() : '';
    if (!currency) {
      return { ok: false, error: 'Big Fish selling is not configured' };
    }
  }
  const nowIso = new Date().toISOString();
  const orderDate = input.initialOrder?.orderDate ?? todayIsoDate();
  const hasOrder = input.initialOrder != null;
  const rlaId = ensured.data.id;

  const rlaUpdate = await updateRetailerLineAccountStatus({
    lineAccountId: rlaId,
    relationshipStatus: 'opened',
    convertedAt: nowIso,
    initialOrderDate: hasOrder ? `${orderDate}T12:00:00.000Z` : null,
  });
  if (rlaUpdate.error) {
    return { ok: false, error: rlaUpdate.error };
  }

  if (input.initialOrder) {
    const orderResult = await insertOrder(
      {
        account_id: input.accountId,
        line_id: salesLineId,
        retailer_line_account_id: rlaId,
        order_type: 'initial',
        season: input.initialOrder.season,
        order_date: orderDate,
        total_amount_cad: input.initialOrder.totalAmountCad,
        original_amount: input.initialOrder.originalAmountUsd ?? null,
        original_currency: input.initialOrder.originalAmountUsd != null ? 'USD' : null,
        exchange_rate: input.initialOrder.exchangeRate ?? null,
        exchange_rate_date: input.initialOrder.exchangeRateDate ?? null,
        conversion_source: input.initialOrder.fxConversionSource ?? null,
        status: 'submitted',
        notes: input.initialOrder.notes ?? null,
      },
      {
        writesEnabled: true,
        lineCode: line.data.code,
        lineStatus: line.data.status,
        lineDefaultCurrency: line.data.defaultCurrency,
        eaglePeakSellingEnabled: input.eaglePeakSellingEnabled,
        bigFishSellingEnabled: input.bigFishSellingEnabled,
      },
    );

    if (orderResult.error) {
      return { ok: false, error: orderResult.error };
    }
  }

  if (!isOgr) {
    return { ok: true, alreadyActive: false, convertedAt: nowIso };
  }

  const settingsResult = await upsertAccountReorderSettings({
    account_id: input.accountId,
    last_order_date: hasOrder ? orderDate : null,
    retailer_line_account_id: rlaId,
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
    retailerLineAccountId: rlaId,
  });
  if (!attrResult.ok) {
    attributionError = attrResult.error;
  }

  return { ok: true, alreadyActive: false, convertedAt: nowIso, attributionError };
}

export interface DemoteToProspectInput {
  accountId: number;
  currentStatus: AccountStatus;
  writesEnabled?: boolean;
  salesLineId?: string | null;
}

export type DemoteToProspectResult =
  { ok: true; alreadyProspect: boolean } | { ok: false; error: string };

/**
 * Move an opened line account back to prospect status.
 * Keeps orders, contacts, and reorder settings on the same id; clears RLA converted_at.
 * Does not write prospects.account_status / converted_at.
 */
export async function demoteToProspect(
  input: DemoteToProspectInput,
): Promise<DemoteToProspectResult> {
  const salesLineId = await resolveWriteSalesLineId(input.salesLineId);
  if (!salesLineId) {
    return { ok: false, error: 'OGR sales line not found' };
  }

  const existing = await fetchOperationalLineAccount({
    retailerId: input.accountId,
    salesLineId,
  });
  if (existing.error) {
    return { ok: false, error: existing.error };
  }

  const line = await fetchLineWriteMeta(salesLineId);
  if (line.error || !line.data) {
    return { ok: false, error: line.error ?? 'Sales line not found' };
  }
  const isOgr = line.data.code === 'ogr';

  if (!existing.data || existing.data.relationshipStatus === 'prospect') {
    if (!isOgr) return { ok: true, alreadyProspect: true };
    if (input.currentStatus !== 'active_account') {
      return { ok: true, alreadyProspect: true };
    }
  }

  if (existing.data && existing.data.relationshipStatus !== 'prospect') {
    const rlaUpdate = await updateRetailerLineAccountStatus({
      lineAccountId: existing.data.id,
      relationshipStatus: 'prospect',
      convertedAt: null,
    });
    if (rlaUpdate.error) {
      return { ok: false, error: rlaUpdate.error };
    }
  }

  return { ok: true, alreadyProspect: false };
}
