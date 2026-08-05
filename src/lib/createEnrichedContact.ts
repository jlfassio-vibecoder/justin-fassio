import { generateObject } from 'ai';
import { z } from 'zod';
import type { AgentSupabase } from '@/lib/agentAuth';
import {
  ACCOUNT_CONTACT_SELECT,
  mapAccountContactRow,
  type AccountContact,
} from '@/lib/accountContacts';
import { researchCompany } from '@/lib/companyWebResearch';
import { createEnrichedProspect } from '@/lib/createEnrichedProspect';
import { mapProspectRow, PROSPECT_SELECT, type Prospect } from '@/lib/prospects';
import type { AccountContact as AccountContactRow, ProspectRow } from '@/types/database';

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
};

export type CreateEnrichedContactResult =
  { ok: true; prospect: Prospect; contact: AccountContact } | { ok: false; error: string };

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

async function countContactsForAccount(
  supabase: AgentSupabase,
  accountId: number,
): Promise<{ count: number; error: string | null }> {
  const { count, error } = await supabase
    .from('account_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId);

  if (error) {
    return { count: 0, error: error.message };
  }
  return { count: count ?? 0, error: null };
}

async function insertContactForAccount(
  supabase: AgentSupabase,
  input: {
    accountId: number;
    contactName: string;
    title: string | null;
    phone: string | null;
    email: string | null;
    isPrimary: boolean;
  },
): Promise<{ data: AccountContact | null; error: string | null }> {
  const { data, error } = await supabase
    .from('account_contacts')
    .insert({
      account_id: input.accountId,
      role: 'buyer',
      full_name: input.contactName,
      title: input.title,
      phone: input.phone,
      email: input.email,
      is_primary: input.isPrimary,
    })
    .select(ACCOUNT_CONTACT_SELECT)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: mapAccountContactRow(data as AccountContactRow), error: null };
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
  });
  const researchBrief = research.brief;

  const gaps = await fillContactGapsFromBrief({
    contactName,
    brief: researchBrief,
    phone: formPhone,
    email: formEmail,
  });

  let prospect: Prospect;

  if (input.mode === 'attach') {
    const accountId = input.accountId;
    if (accountId == null || !Number.isFinite(accountId)) {
      return { ok: false, error: 'Account id is required to attach a contact' };
    }

    const existing = await fetchProspectById(supabase, accountId);
    if (existing.error || !existing.data) {
      return { ok: false, error: existing.error ?? 'Store not found' };
    }
    prospect = existing.data;

    const counted = await countContactsForAccount(supabase, accountId);
    if (counted.error) {
      return { ok: false, error: counted.error };
    }

    const contactResult = await insertContactForAccount(supabase, {
      accountId,
      contactName,
      title: gaps.title,
      phone: gaps.phone,
      email: gaps.email,
      isPrimary: counted.count === 0,
    });
    if (contactResult.error || !contactResult.data) {
      return { ok: false, error: contactResult.error ?? 'Failed to create contact' };
    }

    return { ok: true, prospect, contact: contactResult.data };
  }

  const prospectResult = await createEnrichedProspect(supabase, {
    companyName,
    websiteUrl,
    contactName,
    researchBrief,
    createBuyerContact: false,
  });
  if (!prospectResult.ok) {
    return prospectResult;
  }
  prospect = prospectResult.prospect;

  const contactResult = await insertContactForAccount(supabase, {
    accountId: prospect.id,
    contactName,
    title: gaps.title,
    phone: gaps.phone,
    email: gaps.email,
    isPrimary: true,
  });
  if (contactResult.error || !contactResult.data) {
    return { ok: false, error: contactResult.error ?? 'Failed to create contact' };
  }

  return { ok: true, prospect, contact: contactResult.data };
}
