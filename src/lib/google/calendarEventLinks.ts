import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { partitionCrmRowsForSalesLine } from '@/lib/crmLineage';
import { isUuid } from '@/lib/resolveSalesLineQuery';

type Client = SupabaseClient<Database>;

export const PRIMARY_CALENDAR_ID = 'primary';

export type CalendarLinkStatus = 'suggested' | 'confirmed';

export type CalendarEventLinkRow = Database['public']['Tables']['calendar_event_links']['Row'];

export type CalendarEventLinkPublic = {
  id: string;
  googleConnectionId: string;
  calendarId: string;
  googleEventId: string;
  prospectId: number | null;
  accountContactId: string | null;
  linkStatus: CalendarLinkStatus;
  title: string | null;
  startAt: string | null;
  endAt: string | null;
  meetUrl: string | null;
  attendees: string[];
};

export type CalendarEventLinkCache = {
  title?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  meetUrl?: string | null;
  attendees?: string[];
};

export class CalendarEventLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarEventLinkError';
  }
}

function asAttendees(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && Boolean(v.trim()));
}

export function toPublicCalendarEventLink(row: CalendarEventLinkRow): CalendarEventLinkPublic {
  const status: CalendarLinkStatus = row.link_status === 'suggested' ? 'suggested' : 'confirmed';
  return {
    id: row.id,
    googleConnectionId: row.google_connection_id,
    calendarId: row.calendar_id,
    googleEventId: row.google_event_id,
    prospectId: row.prospect_id,
    accountContactId: row.account_contact_id,
    linkStatus: status,
    title: row.title,
    startAt: row.start_at,
    endAt: row.end_at,
    meetUrl: row.meet_url,
    attendees: asAttendees(row.attendees),
  };
}

export async function getCalendarEventLink(params: {
  client: Client;
  googleConnectionId: string;
  googleEventId: string;
  calendarId?: string;
}): Promise<CalendarEventLinkRow | null> {
  const calendarId = params.calendarId?.trim() || PRIMARY_CALENDAR_ID;
  const { data, error } = await params.client
    .from('calendar_event_links')
    .select('*')
    .eq('google_connection_id', params.googleConnectionId)
    .eq('calendar_id', calendarId)
    .eq('google_event_id', params.googleEventId)
    .maybeSingle();
  if (error) throw new CalendarEventLinkError(error.message);
  return data;
}

export async function listConfirmedCalendarLinksForProspect(params: {
  client: Client;
  prospectId: number;
  limit?: number;
  salesLineId?: string | null;
}): Promise<CalendarEventLinkRow[]> {
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 50);
  const { data, error } = await params.client
    .from('calendar_event_links')
    .select('*')
    .eq('prospect_id', params.prospectId)
    .eq('link_status', 'confirmed')
    .order('start_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new CalendarEventLinkError(error.message);
  const rows = data ?? [];
  const salesLineId = params.salesLineId?.trim() || null;
  if (!salesLineId) return rows;

  const rlaIds = [
    ...new Set(
      rows.map((row) => row.retailer_line_account_id).filter((id): id is string => Boolean(id)),
    ),
  ];
  const rlaSalesLineById = new Map<string, string>();
  if (rlaIds.length > 0) {
    const { data: rlas, error: rlaError } = await params.client
      .from('retailer_line_accounts')
      .select('id, sales_line_id')
      .in('id', rlaIds);
    if (rlaError) throw new CalendarEventLinkError(rlaError.message);
    for (const rla of rlas ?? []) {
      rlaSalesLineById.set(rla.id, rla.sales_line_id);
    }
  }
  const { data: ogr } = await params.client
    .from('lines')
    .select('id')
    .eq('code', 'ogr')
    .maybeSingle();
  const partitioned = partitionCrmRowsForSalesLine(
    rows.map((row) => ({
      id: row.id,
      salesLineId: null,
      retailerLineAccountId: row.retailer_line_account_id,
    })),
    rlaSalesLineById,
    salesLineId,
    ogr?.id ?? null,
  );
  const visibleIds = new Set(partitioned.visible.map((item) => item.id));
  return rows.filter((row) => visibleIds.has(row.id));
}

export async function upsertConfirmedCalendarEventLink(params: {
  client: Client;
  googleConnectionId: string;
  googleEventId: string;
  prospectId: number;
  calendarId?: string;
  accountContactId?: string | null;
  salesLineId?: string | null;
  cache?: CalendarEventLinkCache;
}): Promise<CalendarEventLinkRow> {
  const calendarId = params.calendarId?.trim() || PRIMARY_CALENDAR_ID;
  const accountContactId = params.accountContactId?.trim() || null;
  if (accountContactId) {
    const { data: contact, error: contactError } = await params.client
      .from('account_contacts')
      .select('id, account_id')
      .eq('id', accountContactId)
      .maybeSingle();
    if (contactError) throw new CalendarEventLinkError(contactError.message);
    if (!contact || contact.account_id !== params.prospectId) {
      throw new CalendarEventLinkError('accountContactId does not belong to prospectId');
    }
  }

  let retailerLineAccountId: string | undefined;
  if (params.salesLineId && isUuid(params.salesLineId)) {
    const { data: rla, error: rlaError } = await params.client
      .from('retailer_line_accounts')
      .select('id')
      .eq('retailer_id', params.prospectId)
      .eq('sales_line_id', params.salesLineId)
      .neq('relationship_status', 'terminated')
      .maybeSingle();
    // Copilot suggestion ignored: keep PostgREST error messages like other calendar link helpers.
    if (rlaError) throw new CalendarEventLinkError(rlaError.message);
    retailerLineAccountId = rla?.id;
  }

  const { data, error } = await params.client
    .from('calendar_event_links')
    .upsert(
      {
        google_connection_id: params.googleConnectionId,
        calendar_id: calendarId,
        google_event_id: params.googleEventId,
        prospect_id: params.prospectId,
        account_contact_id: accountContactId,
        link_status: 'confirmed',
        title: params.cache?.title ?? null,
        start_at: params.cache?.startAt ?? null,
        end_at: params.cache?.endAt ?? null,
        meet_url: params.cache?.meetUrl ?? null,
        attendees: params.cache?.attendees ?? [],
        ...(retailerLineAccountId ? { retailer_line_account_id: retailerLineAccountId } : {}),
      },
      { onConflict: 'google_connection_id,calendar_id,google_event_id' },
    )
    .select('*')
    .single();
  if (error || !data) {
    throw new CalendarEventLinkError(error?.message ?? 'Failed to save calendar event link');
  }
  return data;
}

export async function refreshCalendarEventLinkCache(params: {
  client: Client;
  googleConnectionId: string;
  googleEventId: string;
  calendarId?: string;
  cache: CalendarEventLinkCache;
}): Promise<CalendarEventLinkRow | null> {
  const existing = await getCalendarEventLink(params);
  if (!existing) return null;
  const { data, error } = await params.client
    .from('calendar_event_links')
    .update({
      title: params.cache.title ?? existing.title,
      start_at: params.cache.startAt ?? existing.start_at,
      end_at: params.cache.endAt ?? existing.end_at,
      meet_url: params.cache.meetUrl ?? existing.meet_url,
      attendees: params.cache.attendees ?? asAttendees(existing.attendees),
    })
    .eq('id', existing.id)
    .select('*')
    .single();
  if (error || !data) {
    throw new CalendarEventLinkError(
      error?.message ?? 'Failed to refresh calendar event link cache',
    );
  }
  return data;
}

export async function deleteCalendarEventLink(params: {
  client: Client;
  googleConnectionId: string;
  googleEventId: string;
  calendarId?: string;
}): Promise<boolean> {
  const calendarId = params.calendarId?.trim() || PRIMARY_CALENDAR_ID;
  const { error, count } = await params.client
    .from('calendar_event_links')
    .delete({ count: 'exact' })
    .eq('google_connection_id', params.googleConnectionId)
    .eq('calendar_id', calendarId)
    .eq('google_event_id', params.googleEventId);
  if (error) throw new CalendarEventLinkError(error.message);
  return (count ?? 0) > 0;
}
