/**
 * Client-safe staff AI POST fields from LineContext (Phase 4).
 * Islands must not read FEATURE_MULTI_LINE_AI from import.meta.env.
 */

import { fetchOperationalLineAccount } from '@/lib/retailerLineAccounts';

export type StaffAiPostFields = {
  salesLineId?: string;
  retailerLineAccountId?: string;
};

/** When the staff snapshot is on, attach salesLineId and optional matching RLA. */
export async function staffAiPostFields(input: {
  multiLineAi: boolean;
  salesLineId: string | null;
  prospectId?: number | null;
}): Promise<StaffAiPostFields> {
  if (!input.multiLineAi || !input.salesLineId) return {};
  const fields: StaffAiPostFields = { salesLineId: input.salesLineId };
  if (input.prospectId != null) {
    const rla = await fetchOperationalLineAccount({
      retailerId: input.prospectId,
      salesLineId: input.salesLineId,
    });
    if (rla.data?.id) fields.retailerLineAccountId = rla.data.id;
  }
  return fields;
}
