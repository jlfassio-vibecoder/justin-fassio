import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

type Client = SupabaseClient<Database>;

export type GmailLinkStatus = 'suggested' | 'confirmed';

export type GmailThreadLinkRow = Database['public']['Tables']['gmail_thread_links']['Row'];

export type GmailThreadLinkPublic = {
  id: string;
  googleConnectionId: string;
  gmailThreadId: string;
  prospectId: number | null;
  accountContactId: string | null;
  linkStatus: GmailLinkStatus;
  subject: string | null;
  snippet: string | null;
  participants: string[];
  unread: boolean;
  lastMessageAt: string | null;
};

export type GmailThreadLinkCache = {
  subject?: string | null;
  snippet?: string | null;
  participants?: string[];
  unread?: boolean;
  lastMessageAt?: string | null;
};

export class GmailThreadLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GmailThreadLinkError';
  }
}

function asParticipants(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && Boolean(v.trim()));
}

export function toPublicGmailThreadLink(row: GmailThreadLinkRow): GmailThreadLinkPublic {
  const status: GmailLinkStatus = row.link_status === 'suggested' ? 'suggested' : 'confirmed';
  return {
    id: row.id,
    googleConnectionId: row.google_connection_id,
    gmailThreadId: row.gmail_thread_id,
    prospectId: row.prospect_id,
    accountContactId: row.account_contact_id,
    linkStatus: status,
    subject: row.subject,
    snippet: row.snippet,
    participants: asParticipants(row.participants),
    unread: row.unread,
    lastMessageAt: row.last_message_at,
  };
}

export async function getGmailThreadLink(params: {
  client: Client;
  googleConnectionId: string;
  gmailThreadId: string;
}): Promise<GmailThreadLinkRow | null> {
  const { data, error } = await params.client
    .from('gmail_thread_links')
    .select('*')
    .eq('google_connection_id', params.googleConnectionId)
    .eq('gmail_thread_id', params.gmailThreadId)
    .maybeSingle();
  if (error) throw new GmailThreadLinkError(error.message);
  return data;
}

export async function listConfirmedLinksForProspect(params: {
  client: Client;
  prospectId: number;
  limit?: number;
}): Promise<GmailThreadLinkRow[]> {
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 50);
  const { data, error } = await params.client
    .from('gmail_thread_links')
    .select('*')
    .eq('prospect_id', params.prospectId)
    .eq('link_status', 'confirmed')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new GmailThreadLinkError(error.message);
  return data ?? [];
}

export async function upsertConfirmedGmailThreadLink(params: {
  client: Client;
  googleConnectionId: string;
  gmailThreadId: string;
  prospectId: number;
  accountContactId?: string | null;
  cache?: GmailThreadLinkCache;
}): Promise<GmailThreadLinkRow> {
  const { data, error } = await params.client
    .from('gmail_thread_links')
    .upsert(
      {
        google_connection_id: params.googleConnectionId,
        gmail_thread_id: params.gmailThreadId,
        prospect_id: params.prospectId,
        account_contact_id: params.accountContactId ?? null,
        link_status: 'confirmed',
        subject: params.cache?.subject ?? null,
        snippet: params.cache?.snippet ?? null,
        participants: params.cache?.participants ?? [],
        unread: params.cache?.unread ?? false,
        last_message_at: params.cache?.lastMessageAt ?? null,
      },
      { onConflict: 'google_connection_id,gmail_thread_id' },
    )
    .select('*')
    .single();
  if (error || !data) {
    throw new GmailThreadLinkError(error?.message ?? 'Failed to save Gmail thread link');
  }
  return data;
}

export async function deleteGmailThreadLink(params: {
  client: Client;
  googleConnectionId: string;
  gmailThreadId: string;
}): Promise<boolean> {
  const { error, count } = await params.client
    .from('gmail_thread_links')
    .delete({ count: 'exact' })
    .eq('google_connection_id', params.googleConnectionId)
    .eq('gmail_thread_id', params.gmailThreadId);
  if (error) throw new GmailThreadLinkError(error.message);
  return (count ?? 0) > 0;
}
