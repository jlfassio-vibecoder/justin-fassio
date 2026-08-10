import type { SupabaseClient } from '@supabase/supabase-js';
import { extractEmailAddress, parseAddressList } from '@/lib/google/gmailMime';
import type { GmailMessageView, GmailThreadDetail } from '@/lib/google/gmailTypes';
import type { Database } from '@/types/database';

export type GmailParticipantRole = 'from' | 'to' | 'cc';

export type GmailParticipant = {
  email: string;
  role: GmailParticipantRole;
};

export type CrmEmailMatch = {
  email: string;
  role: GmailParticipantRole;
  accountContactId: string;
  contactName: string;
  prospectId: number;
  prospectName: string;
  accountStatus: string;
  confidence: 'high' | 'medium';
};

type DbClient = SupabaseClient<Database>;

function escapeIlikeExact(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Collect unique participant emails from a thread (From/To/Cc), excluding self mailbox. */
export function extractThreadParticipants(
  thread: GmailThreadDetail,
  selfEmail?: string | null,
): GmailParticipant[] {
  const self = selfEmail?.trim().toLowerCase() ?? '';
  const byEmail = new Map<string, GmailParticipantRole>();

  const consider = (header: string, role: GmailParticipantRole) => {
    for (const email of parseAddressList(header)) {
      if (self && email === self) continue;
      const existing = byEmail.get(email);
      if (!existing) {
        byEmail.set(email, role);
        continue;
      }
      const rank = { from: 0, to: 1, cc: 2 } as const;
      if (rank[role] < rank[existing]) byEmail.set(email, role);
    }
  };

  for (const message of thread.messages) {
    consider(message.from, 'from');
    consider(message.to, 'to');
    consider(message.cc, 'cc');
  }

  return [...byEmail.entries()].map(([email, role]) => ({ email, role }));
}

export function participantEmailsFromMessage(message: GmailMessageView): string[] {
  const out: string[] = [];
  for (const header of [message.from, message.to, message.cc]) {
    for (const email of parseAddressList(header)) {
      if (!out.includes(email)) out.push(email);
    }
  }
  return out;
}

/** Exact-match participant emails to account_contacts.email (case-insensitive). */
export async function matchParticipantsToCrm(
  client: DbClient,
  participants: GmailParticipant[],
): Promise<CrmEmailMatch[]> {
  if (participants.length === 0) return [];

  const emails = participants.map((p) => p.email);
  const orFilter = emails.map((email) => `email.ilike.${escapeIlikeExact(email)}`).join(',');

  const { data: contacts, error } = await client
    .from('account_contacts')
    .select('id, account_id, full_name, email')
    .or(orFilter);

  if (error || !contacts?.length) return [];

  const prospectIds = [
    ...new Set(contacts.map((c) => c.account_id).filter((id) => Number.isFinite(id))),
  ];
  const { data: prospects, error: prospectError } = await client
    .from('prospects')
    .select('id, name, account_status')
    .in('id', prospectIds);

  if (prospectError) return [];
  const prospectById = new Map((prospects ?? []).map((p) => [p.id, p]));

  const roleByEmail = new Map(participants.map((p) => [p.email, p.role]));
  const matches: CrmEmailMatch[] = [];

  for (const row of contacts) {
    const contactEmail = extractEmailAddress(row.email ?? '') ?? row.email?.trim().toLowerCase();
    if (!contactEmail) continue;
    const role = roleByEmail.get(contactEmail);
    if (!role) continue;
    const prospect = prospectById.get(row.account_id);
    if (!prospect) continue;

    matches.push({
      email: contactEmail,
      role,
      accountContactId: row.id,
      contactName: row.full_name,
      prospectId: prospect.id,
      prospectName: prospect.name,
      accountStatus: prospect.account_status,
      confidence: role === 'from' || role === 'to' ? 'high' : 'medium',
    });
  }

  matches.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === 'high' ? -1 : 1;
    return a.email.localeCompare(b.email);
  });

  return matches;
}
