import { supabase } from '@/lib/supabase';

export type PendingWholesaleBuyer = {
  id: string;
  email: string | null;
  displayName: string | null;
  prospectId: number | null;
  prospectName: string | null;
  wholesalePricingUnlocked: boolean;
  status: string;
  createdAt: string;
};

export type WholesaleBuyerApprovalsResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function listPendingWholesaleBuyers(): Promise<
  WholesaleBuyerApprovalsResult<PendingWholesaleBuyer[]>
> {
  const { data, error } = await supabase.rpc('list_pending_wholesale_buyers');
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      prospectId: row.prospect_id,
      prospectName: row.prospect_name,
      wholesalePricingUnlocked: row.wholesale_pricing_unlocked,
      status: row.status,
      createdAt: row.created_at,
    })),
  };
}

export async function setBuyerWholesalePricing(
  targetId: string,
  unlocked: boolean,
): Promise<WholesaleBuyerApprovalsResult<null>> {
  if (!targetId.trim()) return { ok: false, error: 'targetId is required' };
  const { error } = await supabase.rpc('set_buyer_wholesale_pricing', {
    target_id: targetId,
    unlocked,
    approve_profile: unlocked,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}
