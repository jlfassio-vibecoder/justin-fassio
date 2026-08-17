import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { evaluateLeadState } from '@/lib/outreachLeadState';
import { aggregateProspectOutreachEngagement } from '@/lib/outreachEngagementAggregate';
import { listOutreachLeads } from '@/lib/outreachLeadLists';

type DbClient = SupabaseClient<Database>;

const PRODUCT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRODUCT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function thenable<T extends Record<string, unknown>>(
  methods: T,
  result: { data: unknown; error: unknown },
): T & PromiseLike<{ data: unknown; error: unknown }> {
  return {
    ...methods,
    then(onFulfilled, onRejected) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
}

function chain(result: { data: unknown; error: unknown }) {
  const api: Record<string, unknown> = {};
  const self = () => thenable(api, result);
  for (const key of ['select', 'eq', 'in', 'not', 'or', 'is', 'lte', 'order', 'limit']) {
    api[key] = vi.fn(self);
  }
  api.maybeSingle = vi.fn(async () => result);
  return thenable(api, result);
}

describe('listOutreachLeads filtering helpers', () => {
  it('filters warm/hot/call_today from evaluated rows (pure filter check)', () => {
    const asOf = new Date('2026-08-10T12:00:00Z');
    const warmEngagement = aggregateProspectOutreachEngagement({
      prospectId: 1,
      messages: [
        {
          id: '1',
          prospect_id: 1,
          to_email: 'a@example.com',
          catalog_item_id: PRODUCT_A,
          sent_at: '2026-08-01T00:00:00Z',
          open_count: 1,
          click_count: 1,
          last_opened_at: '2026-08-09T00:00:00Z',
          last_clicked_at: '2026-08-09T00:00:00Z',
          bounced_at: null,
          complained_at: null,
          status: 'sent',
        },
      ],
    });
    expect(evaluateLeadState({ engagement: warmEngagement, asOf }).leadState).toBe('warm');

    const hotEngagement = aggregateProspectOutreachEngagement({
      prospectId: 2,
      messages: [
        {
          id: '1',
          prospect_id: 2,
          to_email: 'b@example.com',
          catalog_item_id: PRODUCT_A,
          sent_at: '2026-08-01T00:00:00Z',
          open_count: 1,
          click_count: 1,
          last_opened_at: '2026-08-09T00:00:00Z',
          last_clicked_at: '2026-08-09T00:00:00Z',
          bounced_at: null,
          complained_at: null,
          status: 'sent',
        },
        {
          id: '2',
          prospect_id: 2,
          to_email: 'b@example.com',
          catalog_item_id: PRODUCT_B,
          sent_at: '2026-08-02T00:00:00Z',
          open_count: 1,
          click_count: 1,
          last_opened_at: '2026-08-09T00:00:00Z',
          last_clicked_at: '2026-08-09T00:00:00Z',
          bounced_at: null,
          complained_at: null,
          status: 'sent',
        },
      ],
    });
    expect(evaluateLeadState({ engagement: hotEngagement, asOf }).leadState).toBe('hot');

    const followOnly = evaluateLeadState({
      engagement: aggregateProspectOutreachEngagement({
        prospectId: 3,
        messages: [
          {
            id: '1',
            prospect_id: 3,
            to_email: 'c@example.com',
            catalog_item_id: PRODUCT_A,
            sent_at: '2026-08-01T00:00:00Z',
            open_count: 0,
            click_count: 0,
            last_opened_at: null,
            last_clicked_at: null,
            bounced_at: null,
            complained_at: null,
            status: 'sent',
          },
        ],
      }),
      followUpDue: true,
      asOf,
    });
    expect(followOnly.leadState).toBe('cold');
    expect(followOnly.callTodayReasons).toEqual(['follow_up_due']);
  });
});

describe('listOutreachLeads integration (mocked client)', () => {
  it('includes unique-email unlinked manuals and follow_up_due Call Today', async () => {
    const asOf = new Date('2026-08-10T18:00:00Z');

    const from = vi.fn((table: string) => {
      if (table === 'account_contacts') {
        return chain({
          data: [{ account_id: 42, email: 'unique@example.com' }],
          error: null,
        });
      }
      if (table === 'system_messages') {
        return chain({
          data: [
            {
              id: 'm1',
              prospect_id: null,
              to_email: 'unique@example.com',
              catalog_item_id: PRODUCT_A,
              sent_at: '2026-08-01T00:00:00Z',
              open_count: 1,
              click_count: 1,
              last_opened_at: '2026-08-09T00:00:00Z',
              last_clicked_at: '2026-08-09T00:00:00Z',
              bounced_at: null,
              complained_at: null,
              status: 'sent',
              account_contact_id: null,
            },
          ],
          error: null,
        });
      }
      if (table === 'calls') {
        return chain({
          data: [{ prospect_id: 99, follow_up_date: '2026-08-10' }],
          error: null,
        });
      }
      if (table === 'prospects') {
        return chain({
          data: [
            { id: 42, name: 'Unique Cafe', account_status: 'prospect' },
            { id: 99, name: 'Follow Up Co', account_status: 'prospect' },
          ],
          error: null,
        });
      }
      if (table === 'lines') {
        return chain({ data: { id: 'line-ogr' }, error: null });
      }
      if (table === 'retailer_line_accounts') {
        return chain({
          data: [
            { retailer_id: 42, relationship_status: 'prospect' },
            { retailer_id: 99, relationship_status: 'prospect' },
          ],
          error: null,
        });
      }
      if (table === 'gmail_thread_links') {
        return chain({ data: [], error: null });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const client = { from } as unknown as DbClient;
    const leads = await listOutreachLeads(client, { asOf });
    const byId = new Map(leads.map((l) => [l.prospectId, l]));

    expect(byId.get(42)?.engagement.unlinkedManualIncluded).toBe(1);
    expect(byId.get(42)?.engagement.clickCount).toBe(1);
    expect(byId.get(99)?.callTodayReasons).toContain('follow_up_due');
  });
});
