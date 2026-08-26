import { generateObject } from 'ai';
import { z } from 'zod';
import type { AgentSupabase } from '@/lib/agentAuth';
import {
  ACCOUNT_CONTACT_SELECT,
  classifyAccountContactDuplicate,
  mapAccountContactRow,
  type AccountContact,
} from '@/lib/accountContacts';
import {
  buildContactResearchBrief,
  composeContactResearchBrief,
} from '@/lib/contactResearch/buildContactResearchBrief';
import { extractOwnerFromYelpListing } from '@/lib/contactResearch/extractOwnerFromYelpListing';
import { mapContactRole } from '@/lib/contactResearch/mapContactRole';
import { researchContactDiscovery } from '@/lib/contactResearch/researchContactDiscovery';
import {
  formatRoleVerificationNotes,
  verifyPublicContactRole,
  type PublicRoleVerificationStatus,
} from '@/lib/contactResearch/verifyPublicContactRole';
import { researchCompany } from '@/lib/companyWebResearch';
import { yelpBizSearchUrl } from '@/lib/yelp/businessMatch';
import { createEnrichedProspect } from '@/lib/createEnrichedProspect';
import { isValidOgrProductEmailRecipient } from '@/lib/ogrProductEmailLimits';
import { mapProspectRow, PROSPECT_SELECT, type Prospect } from '@/lib/prospects';
import type {
  AccountContact as AccountContactRow,
  AccountContactRole,
  ProspectRow,
} from '@/types/database';

const contactGapsSchema = z.object({
  title: z
    .string()
    .nullable()
    .describe('Job title only if explicitly present in the brief for this person; otherwise null'),
  phone: z
    .string()
    .nullable()
    .describe('Phone only if explicitly present in the brief for this person; otherwise null'),
  email: z
    .string()
    .nullable()
    .describe('Email only if explicitly present in the brief for this person; otherwise null'),
});

const contactNameSchema = z.object({
  fullName: z
    .string()
    .nullable()
    .describe(
      'Full name of the likely purchasing contact (owner, buyer, GM) only if explicitly named in the brief; otherwise null',
    ),
});

export type CreateEnrichedContactMode = 'create_prospect' | 'attach';

export type CreateEnrichedContactInput = {
  contactName: string;
  companyName: string;
  phone?: string;
  email?: string;
  websiteUrl?: string;
  mode: CreateEnrichedContactMode;
  /** Required when mode is `attach`. */
  accountId?: number;
  salesLineId?: string;
  lineCode?: string;
  aiPersona?: string;
};

export type CreateEnrichedContactResult =
  { ok: true; prospect: Prospect; contact: AccountContact } | { ok: false; error: string };

export type ContactRoleVerificationPreview = {
  status: PublicRoleVerificationStatus;
  signals: { personName: boolean; company: boolean; role: boolean; location: boolean };
  excerpt: string | null;
  sourceUrls: string[];
  suggestedNotes: string | null;
};

export type ContactEnrichPreview = {
  accountId: number;
  companyName: string;
  researchBrief: string | null;
  yelpListingUrl: string | null;
  yelpVerifiedName: string | null;
  yelpCategories: string[];
  yelpMatchError: string | null;
  roleVerification: ContactRoleVerificationPreview | null;
  proposed: {
    fullName: string;
    title: string | null;
    phone: string | null;
    email: string | null;
    role: AccountContactRole;
    isPrimary: boolean;
  };
  duplicate: { kind: 'email' | 'name'; contact: AccountContact } | null;
};

export type PreviewEnrichedContactAttachInput = {
  accountId: number;
  candidateName?: string | null;
  resolvedWebsite?: string | null;
  aiPersona?: string;
};

export type ApplyEnrichedContactAttachInput = {
  accountId: number;
  fullName: string;
  title?: string | null;
  phone?: string | null;
  email?: string | null;
  role: AccountContactRole;
  notes?: string | null;
  confirmDuplicateEmail?: boolean;
  salesLineId?: string;
  lineCode?: string;
};

async function fetchProspectById(
  supabase: AgentSupabase,
  id: number,
): Promise<{ data: Prospect | null; error: string | null }> {
  const { data, error } = await supabase
    .from('prospects')
    .select(PROSPECT_SELECT)
    .eq('id', id)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }
  return { data: mapProspectRow(data as ProspectRow), error: null };
}

async function fetchContactsForAccountServer(
  supabase: AgentSupabase,
  accountId: number,
): Promise<{ data: AccountContact[]; error: string | null }> {
  const { data, error } = await supabase
    .from('account_contacts')
    .select(ACCOUNT_CONTACT_SELECT)
    .eq('account_id', accountId)
    .order('is_primary', { ascending: false })
    .order('full_name', { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return {
    data: ((data ?? []) as AccountContactRow[]).map(mapAccountContactRow),
    error: null,
  };
}

async function insertContactForAccount(
  supabase: AgentSupabase,
  input: {
    accountId: number;
    contactName: string;
    title: string | null;
    phone: string | null;
    email: string | null;
    role: AccountContactRole;
    isPrimary: boolean;
    notes: string | null;
  },
): Promise<{ data: AccountContact | null; error: string | null }> {
  const { data, error } = await supabase
    .from('account_contacts')
    .insert({
      account_id: input.accountId,
      role: input.role,
      full_name: input.contactName,
      title: input.title,
      phone: input.phone,
      email: input.email,
      is_primary: input.isPrimary,
      notes: input.notes,
    })
    .select(ACCOUNT_CONTACT_SELECT)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: mapAccountContactRow(data as AccountContactRow), error: null };
}

async function stampLineContactIfNeeded(
  supabase: AgentSupabase,
  contact: AccountContact,
  input: { salesLineId?: string; lineCode?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.lineCode === 'bkg') return { ok: true };
  let salesLineId = input.salesLineId?.trim() || '';
  if (!salesLineId) {
    const { data: ogr, error } = await supabase
      .from('lines')
      .select('id')
      .eq('code', 'ogr')
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!ogr) return { ok: false, error: 'OGR sales line not found' };
    salesLineId = ogr.id;
  }

  let lineAccountId: string | null;
  const { data: existing, error: rlaError } = await supabase
    .from('retailer_line_accounts')
    .select('id')
    .eq('retailer_id', contact.accountId)
    .eq('sales_line_id', salesLineId)
    .neq('relationship_status', 'terminated')
    .maybeSingle();
  if (rlaError) return { ok: false, error: rlaError.message };
  if (existing) {
    lineAccountId = existing.id;
  } else {
    const { data: created, error: insertError } = await supabase
      .from('retailer_line_accounts')
      .insert({
        retailer_id: contact.accountId,
        sales_line_id: salesLineId,
        relationship_status: 'prospect',
      })
      .select('id')
      .single();
    if (insertError) {
      const message = insertError.message.toLowerCase();
      if (
        !message.includes('duplicate') &&
        !message.includes('unique') &&
        !message.includes('23505')
      ) {
        return { ok: false, error: insertError.message };
      }
      const { data: retried, error: retryError } = await supabase
        .from('retailer_line_accounts')
        .select('id')
        .eq('retailer_id', contact.accountId)
        .eq('sales_line_id', salesLineId)
        .neq('relationship_status', 'terminated')
        .maybeSingle();
      if (retryError) return { ok: false, error: retryError.message };
      lineAccountId = retried?.id ?? null;
    } else {
      lineAccountId = created?.id ?? null;
    }
  }
  if (!lineAccountId) return { ok: true };

  const { error: junctionError } = await supabase.from('retailer_line_contacts').upsert(
    {
      retailer_line_account_id: lineAccountId,
      account_contact_id: contact.id,
      role: contact.role,
      is_primary: contact.isPrimary,
      notes: contact.notes,
    },
    { onConflict: 'retailer_line_account_id,account_contact_id' },
  );
  if (junctionError) return { ok: false, error: junctionError.message };
  return { ok: true };
}

/** Infer a named purchasing contact from a research brief when staff did not seed a name. */
export async function inferContactNameFromBrief(brief: string | null): Promise<string | null> {
  if (!brief?.trim()) return null;

  try {
    const result = await generateObject({
      model: 'openai/gpt-4o',
      schema: contactNameSchema,
      schemaName: 'ContactNameFromBrief',
      prompt: [
        'Extract the full name of one purchasing contact from the research brief only.',
        'Return null if no person is explicitly named.',
        'Do not invent names.',
        'Research brief:',
        brief,
      ].join('\n'),
    });
    return result.object.fullName?.trim() || null;
  } catch {
    return null;
  }
}

/** Fill blank contact fields from a research brief; form values always win. */
export async function fillContactGapsFromBrief(input: {
  contactName: string;
  brief: string | null;
  phone: string | null;
  email: string | null;
  title?: string | null;
}): Promise<{ title: string | null; phone: string | null; email: string | null }> {
  const formPhone = input.phone;
  const formEmail = input.email;
  const formTitle = input.title?.trim() || null;

  if (!input.brief || (formPhone && formEmail)) {
    return { title: formTitle, phone: formPhone, email: formEmail };
  }

  try {
    const result = await generateObject({
      model: 'openai/gpt-4o',
      schema: contactGapsSchema,
      schemaName: 'ContactGapsFromBrief',
      prompt: [
        'Extract public contact details for one person from the research brief only.',
        'If a field is not explicitly present for this person, return null for that field.',
        'Do not invent phone numbers or emails.',
        `Contact name: ${input.contactName}`,
        'Research brief:',
        input.brief,
      ].join('\n'),
    });

    return {
      title: formTitle ?? (result.object.title?.trim() || null),
      phone: formPhone ?? (result.object.phone?.trim() || null),
      email: formEmail ?? (result.object.email?.trim() || null),
    };
  } catch {
    return { title: formTitle, phone: formPhone, email: formEmail };
  }
}

/** Preview contact attach for Account Research — no DB write. */
export async function previewEnrichedContactAttach(
  supabase: AgentSupabase,
  input: PreviewEnrichedContactAttachInput,
): Promise<{ ok: true; preview: ContactEnrichPreview } | { ok: false; error: string }> {
  const accountId = input.accountId;
  if (!Number.isFinite(accountId)) {
    return { ok: false, error: 'Account id is required' };
  }

  const existing = await fetchProspectById(supabase, accountId);
  if (existing.error || !existing.data) {
    return { ok: false, error: existing.error ?? 'Store not found' };
  }
  const prospect = existing.data;

  const contactsResult = await fetchContactsForAccountServer(supabase, accountId);
  if (contactsResult.error) {
    return { ok: false, error: contactsResult.error };
  }

  const briefContext = await buildContactResearchBrief({
    prospect,
    resolvedWebsite: input.resolvedWebsite,
    candidateName: input.candidateName,
  });

  const candidateName = input.candidateName?.trim() || undefined;

  const contactResearch = await researchContactDiscovery({
    companyName: prospect.name,
    city: prospect.city,
    state: prospect.region ?? 'OR',
    websiteUrl: briefContext.websiteUrl,
    yelpBusiness: briefContext.yelpMatch?.business ?? null,
    seedBlock: briefContext.seedBlock,
    candidateName,
  });

  let ownerFromYelp: { fullName: string | null; title: string | null; excerpt: string | null } = {
    fullName: null,
    title: null,
    excerpt: null,
  };
  if (!candidateName && briefContext.yelpMatch) {
    ownerFromYelp = await extractOwnerFromYelpListing({
      yelpBusiness: briefContext.yelpMatch.business,
      companyName: prospect.name,
    });
  }

  const researchBrief = composeContactResearchBrief(
    briefContext.seedBlock,
    [contactResearch.brief, ownerFromYelp.excerpt].filter(Boolean).join('\n\n'),
  );

  let fullName = candidateName ?? ownerFromYelp.fullName ?? '';
  if (!fullName && researchBrief) {
    fullName = (await inferContactNameFromBrief(researchBrief)) ?? '';
  }

  const gaps = fullName
    ? await fillContactGapsFromBrief({
        contactName: fullName,
        brief: researchBrief,
        phone: null,
        email: null,
        title: ownerFromYelp.title,
      })
    : { title: ownerFromYelp.title, phone: null, email: null };

  const yelpBusiness = briefContext.yelpMatch?.business ?? null;

  const roleVerificationRaw = fullName.trim()
    ? await verifyPublicContactRole({
        candidateName: fullName,
        businessName: yelpBusiness?.name ?? prospect.name,
        city: prospect.city,
        state: prospect.region ?? 'OR',
        proposedTitle: gaps.title,
      })
    : null;

  let title = gaps.title;
  if (
    !candidateName &&
    roleVerificationRaw?.status === 'verified' &&
    roleVerificationRaw.matchedRole
  ) {
    title = roleVerificationRaw.matchedRole;
  }

  const role = mapContactRole(title);
  const duplicate = fullName
    ? classifyAccountContactDuplicate(contactsResult.data, {
        fullName,
        email: gaps.email,
      })
    : null;

  const roleVerification: ContactRoleVerificationPreview | null = roleVerificationRaw
    ? {
        status: roleVerificationRaw.status,
        signals: roleVerificationRaw.signals,
        excerpt: roleVerificationRaw.excerpt,
        sourceUrls: roleVerificationRaw.sourceUrls,
        suggestedNotes: formatRoleVerificationNotes(roleVerificationRaw),
      }
    : null;

  return {
    ok: true,
    preview: {
      accountId,
      companyName: prospect.name,
      researchBrief,
      yelpListingUrl: yelpBusiness ? yelpBizSearchUrl(yelpBusiness) : null,
      yelpVerifiedName: yelpBusiness?.name ?? null,
      yelpCategories: yelpBusiness?.categories ?? [],
      yelpMatchError: briefContext.yelpMatch ? null : briefContext.yelpMatchError,
      roleVerification,
      proposed: {
        fullName,
        title,
        phone: gaps.phone,
        email: gaps.email,
        role,
        isPrimary: contactsResult.data.length === 0,
      },
      duplicate,
    },
  };
}

/** Apply staff-confirmed contact attach — insert-only. */
export async function applyEnrichedContactAttach(
  supabase: AgentSupabase,
  input: ApplyEnrichedContactAttachInput,
): Promise<CreateEnrichedContactResult> {
  const accountId = input.accountId;
  if (!Number.isFinite(accountId)) {
    return { ok: false, error: 'Account id is required' };
  }

  const fullName = input.fullName.trim();
  if (!fullName) {
    return { ok: false, error: 'Contact name is required' };
  }

  const email = input.email?.trim() || null;
  if (email && !isValidOgrProductEmailRecipient(email)) {
    return { ok: false, error: 'Email address is not a valid recipient' };
  }

  const existing = await fetchProspectById(supabase, accountId);
  if (existing.error || !existing.data) {
    return { ok: false, error: existing.error ?? 'Store not found' };
  }
  const prospect = existing.data;

  const contactsResult = await fetchContactsForAccountServer(supabase, accountId);
  if (contactsResult.error) {
    return { ok: false, error: contactsResult.error };
  }

  const duplicate = classifyAccountContactDuplicate(contactsResult.data, { fullName, email });
  if (duplicate?.kind === 'email' && !input.confirmDuplicateEmail) {
    return {
      ok: false,
      error: `A contact with email ${duplicate.contact.email} already exists (${duplicate.contact.fullName})`,
    };
  }

  const contactResult = await insertContactForAccount(supabase, {
    accountId,
    contactName: fullName,
    title: input.title?.trim() || null,
    phone: input.phone?.trim() || null,
    email,
    role: input.role,
    isPrimary: contactsResult.data.length === 0,
    notes: input.notes?.trim() || null,
  });
  if (contactResult.error || !contactResult.data) {
    return { ok: false, error: contactResult.error ?? 'Failed to create contact' };
  }

  const stamped = await stampLineContactIfNeeded(supabase, contactResult.data, input);
  if (!stamped.ok) return stamped;

  return { ok: true, prospect, contact: contactResult.data };
}

/**
 * Create a contact and optionally an AI-enriched prospect under the caller's JWT + RLS.
 * Known phone/email from the form are preferred; blank gaps may be filled from web research.
 */
export async function createEnrichedContact(
  supabase: AgentSupabase,
  input: CreateEnrichedContactInput,
): Promise<CreateEnrichedContactResult> {
  const contactName = input.contactName.trim();
  if (!contactName) {
    return { ok: false, error: 'Contact name is required' };
  }

  const companyName = input.companyName.trim();
  if (!companyName) {
    return { ok: false, error: 'Company name is required' };
  }

  const formPhone = input.phone?.trim() || null;
  const formEmail = input.email?.trim() || null;
  const websiteUrl = input.websiteUrl?.trim() || undefined;

  const research = await researchCompany({
    companyName,
    websiteUrl,
    contactName,
    persona: input.aiPersona,
  });
  const researchBrief = research.brief;

  const gaps = await fillContactGapsFromBrief({
    contactName,
    brief: researchBrief,
    phone: formPhone,
    email: formEmail,
  });

  if (input.mode === 'attach') {
    const accountId = input.accountId;
    if (accountId == null || !Number.isFinite(accountId)) {
      return { ok: false, error: 'Account id is required to attach a contact' };
    }

    return applyEnrichedContactAttach(supabase, {
      accountId,
      fullName: contactName,
      title: gaps.title,
      phone: gaps.phone,
      email: gaps.email,
      role: 'buyer',
      salesLineId: input.salesLineId,
      lineCode: input.lineCode,
    });
  }

  const prospectResult = await createEnrichedProspect(supabase, {
    companyName,
    websiteUrl,
    contactName,
    researchBrief,
    createBuyerContact: false,
    salesLineId: input.salesLineId,
    lineCode: input.lineCode,
    aiPersona: input.aiPersona,
  });
  if (!prospectResult.ok) {
    return prospectResult;
  }
  const prospect = prospectResult.prospect;

  const contactResult = await insertContactForAccount(supabase, {
    accountId: prospect.id,
    contactName,
    title: gaps.title,
    phone: gaps.phone,
    email: gaps.email,
    role: 'buyer',
    isPrimary: true,
    notes: null,
  });
  if (contactResult.error || !contactResult.data) {
    return { ok: false, error: contactResult.error ?? 'Failed to create contact' };
  }
  const stamped = await stampLineContactIfNeeded(supabase, contactResult.data, input);
  if (!stamped.ok) return stamped;

  return { ok: true, prospect, contact: contactResult.data };
}
