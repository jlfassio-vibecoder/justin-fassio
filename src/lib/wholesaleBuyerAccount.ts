import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePublicSiteOrigin } from '@/lib/productUrls';
import type { Database } from '@/types/database';

type Admin = SupabaseClient<Database>;

export type EnsureWholesaleBuyerInput = {
  email: string;
  buyerName: string;
  prospectId: number;
};

export type EnsureWholesaleBuyerResult =
  | { ok: true; userId: string; invited: boolean; linkedExisting: boolean }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };

function siteOrigin(): string {
  try {
    return resolvePublicSiteOrigin();
  } catch {
    // Copilot suggestion applied: malformed PUBLIC_SITE_URL must not escape ensureWholesaleBuyerAccount.
    return 'https://justinfassio.com';
  }
}

/**
 * Create or link a buyer auth profile for a wholesale form submission.
 * Never auto-unlocks wholesale pricing — staff must approve.
 * Skips staff (owner/rep) accounts so form emails cannot hijack RCC users.
 */
export async function ensureWholesaleBuyerAccount(
  admin: Admin,
  input: EnsureWholesaleBuyerInput,
): Promise<EnsureWholesaleBuyerResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, error: 'Email is required' };

  const { data: existingRows, error: lookupError } = await admin
    .from('profiles')
    .select('id, role, prospect_id, email, display_name')
    .ilike('email', email)
    .limit(10);

  if (lookupError) {
    return { ok: false, error: lookupError.message };
  }

  const existing = (existingRows ?? []).find(
    (row) => (row.email ?? '').trim().toLowerCase() === email,
  );

  if (existing) {
    if (existing.role !== 'buyer') {
      return {
        ok: true,
        skipped: true,
        reason: `Existing ${existing.role} account — not linked as wholesale buyer`,
      };
    }

    // Copilot suggestion applied: never overwrite an existing prospect link from public form submit.
    if (existing.prospect_id != null && existing.prospect_id !== input.prospectId) {
      return {
        ok: true,
        skipped: true,
        reason: 'Buyer already linked to a different prospect',
      };
    }

    const patch: Database['public']['Tables']['profiles']['Update'] = {};
    if (existing.prospect_id == null) {
      patch.prospect_id = input.prospectId;
    }
    if (!existing.display_name?.trim() && input.buyerName.trim()) {
      patch.display_name = input.buyerName.trim();
    }

    if (Object.keys(patch).length > 0) {
      const { error: updateError } = await admin
        .from('profiles')
        .update(patch)
        .eq('id', existing.id);
      if (updateError) return { ok: false, error: updateError.message };
    }

    return { ok: true, userId: existing.id, invited: false, linkedExisting: true };
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      wholesale_buyer: true,
      display_name: input.buyerName.trim() || undefined,
    },
    redirectTo: `${siteOrigin()}/login`,
  });

  if (inviteError || !invited.user) {
    return {
      ok: false,
      error: inviteError?.message?.trim() || 'Failed to invite buyer account',
    };
  }

  const { error: linkError } = await admin
    .from('profiles')
    .update({
      prospect_id: input.prospectId,
      role: 'buyer',
      display_name: input.buyerName.trim() || null,
      wholesale_pricing_unlocked: false,
    })
    .eq('id', invited.user.id);

  if (linkError) {
    return { ok: false, error: linkError.message };
  }

  return { ok: true, userId: invited.user.id, invited: true, linkedExisting: false };
}
