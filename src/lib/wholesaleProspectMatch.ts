import type { SupabaseClient } from '@supabase/supabase-js';
import { nextProspectId } from '@/lib/createEnrichedProspect';
import { resolveTerritoryIdByCode, territoryCodeFromProvince } from '@/lib/territories';
import type { Database } from '@/types/database';

export type WholesaleProspectMatchKind = 'email' | 'name' | 'created';

export type WholesaleProspectMatchInput = {
  businessName: string;
  buyerName: string;
  email: string;
  phone: string;
  city: string;
  province: string;
  website?: string | null;
  retailChannel?: string | null;
  isExistingCustomer?: boolean;
};

export type WholesaleProspectMatchResult =
  | { ok: true; prospectId: number; matched: WholesaleProspectMatchKind }
  | { ok: false; error: string };

type AdminClient = SupabaseClient<Database>;

const SOURCE_NOTE = 'Inbound wholesale (old-guys-rule-wholesale)';

/** Map buyer retail channel onto a CRM primary channel (required NOT NULL on prospects). */
export function categoryFromRetailChannel(retailChannel: string | null | undefined): string {
  const c = (retailChannel ?? '').toLowerCase();
  if (c.includes('golf')) return 'golf_retail';
  if (c.includes('marina') || c.includes('boat')) return 'marine_retail';
  if (c.includes('outdoor') || c.includes('sporting')) return 'outdoor_camping_hunting';
  if (c.includes('resort')) return 'resort_hospitality';
  if (c.includes('gift') || c.includes('lifestyle')) return 'gift_novelty_souvenir';
  if (c.includes('specialty') || c.includes('independent')) return 'apparel_specialty';
  if (c.includes('online')) return 'online_specialty';
  return 'hardware_farm_rural';
}

export function buildWholesaleActivityNote(args: {
  requestNumber: string;
  totalUnits: number;
  merchandiseSubtotalUsd: number;
  skus: string[];
  requestType?: 'order' | 'inquiry';
}): string {
  if (args.requestType === 'inquiry') {
    return `Wholesale inquiry ${args.requestNumber}: no products selected.`;
  }
  const skuList = args.skus.slice(0, 20).join(', ') + (args.skus.length > 20 ? '…' : '');
  return (
    `Wholesale order request ${args.requestNumber}: ${args.totalUnits} units, ` +
    `US$${args.merchandiseSubtotalUsd.toFixed(2)}. SKUs: ${skuList || '(none)'}`
  );
}

function uniqueProspectIds(ids: Array<number | null | undefined>): number[] {
  return [
    ...new Set(ids.filter((id): id is number => typeof id === 'number' && Number.isFinite(id))),
  ];
}

function escapeIlikeExact(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

async function matchByEmail(
  admin: AdminClient,
  email: string,
): Promise<number | null | { error: string }> {
  const normalized = email.trim();
  if (!normalized) return null;

  const { data, error } = await admin
    .from('account_contacts')
    .select('account_id')
    .ilike('email', escapeIlikeExact(normalized));

  if (error) return { error: error.message };
  const ids = uniqueProspectIds((data ?? []).map((r) => r.account_id));
  if (ids.length === 1) return ids[0]!;
  return null;
}

async function matchByName(
  admin: AdminClient,
  businessName: string,
): Promise<number | null | { error: string }> {
  const normalized = businessName.trim();
  if (!normalized) return null;

  const { data, error } = await admin
    .from('prospects')
    .select('id')
    .ilike('name', escapeIlikeExact(normalized));

  if (error) return { error: error.message };
  const ids = uniqueProspectIds((data ?? []).map((r) => r.id));
  if (ids.length === 1) return ids[0]!;
  return null;
}

async function allocateNextId(admin: AdminClient): Promise<number | { error: string }> {
  const { data, error } = await admin
    .from('prospects')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { error: error.message };
  return nextProspectId(data?.id);
}

async function createInboundProspect(
  admin: AdminClient,
  input: WholesaleProspectMatchInput,
): Promise<WholesaleProspectMatchResult> {
  const allocated = await allocateNextId(admin);
  if (typeof allocated !== 'number') return { ok: false, error: allocated.error };

  const territory = await resolveTerritoryIdByCode(
    admin,
    territoryCodeFromProvince(input.province),
  );
  if ('error' in territory) return { ok: false, error: territory.error };

  const existingOgr = input.isExistingCustomer ? 'yes' : 'unknown';
  const { data: prospect, error: prospectError } = await admin
    .from('prospects')
    .insert({
      id: allocated,
      name: input.businessName.trim(),
      category: categoryFromRetailChannel(input.retailChannel),
      region: input.province.trim() || 'Unknown',
      city: input.city.trim(),
      address: '',
      phone: input.phone.trim(),
      fit: '',
      website: input.website?.trim() || null,
      source_note: SOURCE_NOTE,
      existing_ogr: existingOgr,
      retail_category: input.retailChannel?.trim() || null,
      territory_id: territory.id,
      // account_status omitted — DB default 'prospect'
    })
    .select('id')
    .single();

  if (prospectError || !prospect) {
    return { ok: false, error: prospectError?.message ?? 'Failed to create prospect' };
  }

  const { error: contactError } = await admin.from('account_contacts').insert({
    account_id: prospect.id,
    role: 'buyer',
    full_name: input.buyerName.trim(),
    phone: input.phone.trim() || null,
    email: input.email.trim().toLowerCase(),
    is_primary: true,
    notes: SOURCE_NOTE,
  });

  if (contactError) {
    return { ok: false, error: contactError.message };
  }

  const { data: ogr, error: ogrError } = await admin
    .from('lines')
    .select('id')
    .eq('code', 'ogr')
    .maybeSingle();
  if (ogrError || !ogr) {
    return { ok: false, error: ogrError?.message ?? 'OGR sales line not found' };
  }

  const { data: rla, error: rlaError } = await admin
    .from('retailer_line_accounts')
    .insert({
      retailer_id: prospect.id,
      sales_line_id: ogr.id,
      relationship_status: 'prospect',
    })
    .select('id')
    .single();
  if (
    rlaError &&
    !rlaError.message.toLowerCase().includes('duplicate') &&
    !rlaError.message.includes('23505')
  ) {
    return { ok: false, error: rlaError.message };
  }

  const lineAccountId = rla?.id;
  if (lineAccountId) {
    const { data: insertedContact } = await admin
      .from('account_contacts')
      .select('id')
      .eq('account_id', prospect.id)
      .eq('is_primary', true)
      .maybeSingle();
    if (insertedContact) {
      await admin.from('retailer_line_contacts').upsert(
        {
          retailer_line_account_id: lineAccountId,
          account_contact_id: insertedContact.id,
          role: 'buyer',
          is_primary: true,
          notes: SOURCE_NOTE,
        },
        { onConflict: 'retailer_line_account_id,account_contact_id' },
      );
    }
  }

  return { ok: true, prospectId: prospect.id, matched: 'created' };
}

/**
 * Match an existing retailer or create an inbound wholesale prospect.
 * Never sets account_status to active_account.
 */
export async function matchOrCreateWholesaleProspect(
  admin: AdminClient,
  input: WholesaleProspectMatchInput,
): Promise<WholesaleProspectMatchResult> {
  const byEmail = await matchByEmail(admin, input.email);
  if (byEmail && typeof byEmail === 'object' && 'error' in byEmail) {
    return { ok: false, error: byEmail.error };
  }
  if (typeof byEmail === 'number') {
    return { ok: true, prospectId: byEmail, matched: 'email' };
  }

  const byName = await matchByName(admin, input.businessName);
  if (byName && typeof byName === 'object' && 'error' in byName) {
    return { ok: false, error: byName.error };
  }
  if (typeof byName === 'number') {
    return { ok: true, prospectId: byName, matched: 'name' };
  }

  return createInboundProspect(admin, input);
}
