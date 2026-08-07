import { describe, expect, it, vi } from 'vitest';
import { clampCallLimit, createAgentCrmTools, truncateNotes } from '@/lib/agentCrmTools';
import type { AgentSupabase } from '@/lib/agentAuth';

const toolOpts = { toolCallId: 'test', messages: [] };

describe('clampCallLimit', () => {
  it('defaults to 12', () => {
    expect(clampCallLimit()).toBe(12);
    expect(clampCallLimit(undefined)).toBe(12);
    expect(clampCallLimit(Number.NaN)).toBe(12);
  });

  it('clamps to 1–20 and floors', () => {
    expect(clampCallLimit(0)).toBe(1);
    expect(clampCallLimit(-5)).toBe(1);
    expect(clampCallLimit(1)).toBe(1);
    expect(clampCallLimit(12)).toBe(12);
    expect(clampCallLimit(20)).toBe(20);
    expect(clampCallLimit(100)).toBe(20);
    expect(clampCallLimit(7.9)).toBe(7);
  });
});

describe('truncateNotes', () => {
  it('returns empty for nullish', () => {
    expect(truncateNotes(null)).toBe('');
    expect(truncateNotes(undefined)).toBe('');
  });

  it('leaves short notes intact', () => {
    expect(truncateNotes('hello')).toBe('hello');
  });

  it('truncates to 240 chars', () => {
    const long = 'x'.repeat(300);
    expect(truncateNotes(long)).toBe('x'.repeat(240));
    expect(truncateNotes(long).length).toBe(240);
  });
});

describe('createAgentCrmTools', () => {
  it('getProspectSummary returns row when found', async () => {
    const row = {
      id: 12,
      name: 'Coastal Golf',
      category: 'golf_retail',
      region: 'Vancouver Island',
      city: 'Nanaimo',
      fit: 'Strong',
    };
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as AgentSupabase;

    const tools = createAgentCrmTools(supabase);
    const result = await tools.getProspectSummary.execute!({ prospectId: 12 }, toolOpts);

    expect(from).toHaveBeenCalledWith('prospects');
    expect(select).toHaveBeenCalledWith('id,name,category,region,city,fit,account_status');
    expect(eq).toHaveBeenCalledWith('id', 12);
    expect(result).toEqual(row);
  });

  it('getProspectSummary returns not-found error', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as AgentSupabase;

    const tools = createAgentCrmTools(supabase);
    const result = await tools.getProspectSummary.execute!({ prospectId: 99 }, toolOpts);

    expect(result).toEqual({ error: 'Prospect not found' });
  });

  it('listRecentCalls clamps limit and truncates notes', async () => {
    const longNotes = 'n'.repeat(300);
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          call_date: '2026-07-01',
          outcome: 'Sample sent',
          contact_name: 'Pat',
          pmf_score: 4,
          order_value_cad: 0,
          notes: longNotes,
          objection_tags: ['price'],
          follow_up_date: '2026-07-15',
        },
      ],
      error: null,
    });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as AgentSupabase;

    const tools = createAgentCrmTools(supabase);
    const result = await tools.listRecentCalls.execute!({ prospectId: 12, limit: 100 }, toolOpts);

    expect(from).toHaveBeenCalledWith('calls');
    expect(eq).toHaveBeenCalledWith('prospect_id', 12);
    expect(order).toHaveBeenCalledWith('call_date', { ascending: false });
    expect(limit).toHaveBeenCalledWith(20);
    expect(result).toEqual([
      {
        call_date: '2026-07-01',
        outcome: 'Sample sent',
        contact_name: 'Pat',
        pmf_score: 4,
        order_value_cad: 0,
        notes: 'n'.repeat(240),
        objection_tags: ['price'],
        follow_up_date: '2026-07-15',
      },
    ]);
  });

  it('listRecentCalls uses default limit when omitted', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as AgentSupabase;

    const tools = createAgentCrmTools(supabase);
    await tools.listRecentCalls.execute!({ prospectId: 3 }, toolOpts);

    expect(limit).toHaveBeenCalledWith(12);
  });

  it('getAccountProductFit returns prospect, line, and catalog anchors', async () => {
    const prospect = {
      id: 12,
      name: 'Coastal Golf',
      category: 'golf_retail',
      region: 'Vancouver Island',
      city: 'Nanaimo',
      fit: 'Strong coastal golf traffic',
    };
    const line = { id: 'line-1', code: 'ogr', name: 'Old Guys Rule' };
    const anchors = [
      {
        sku: 'OGR-100',
        name: 'Classic Tee',
        cat: 'Tees',
        color: 'Navy',
        tagline: 'Keep it simple',
        is_new: false,
        is_name_drop: true,
        msrp_cad: 42,
        page: 1,
      },
    ];

    const prospectMaybeSingle = vi.fn().mockResolvedValue({ data: prospect, error: null });
    const lineMaybeSingle = vi.fn().mockResolvedValue({ data: line, error: null });
    const catalogLimit = vi.fn().mockResolvedValue({ data: anchors, error: null });
    const catalogOrderPage = vi.fn().mockReturnValue({ limit: catalogLimit });
    const catalogOrderNew = vi.fn().mockReturnValue({ order: catalogOrderPage });
    const catalogOrderDrop = vi.fn().mockReturnValue({ order: catalogOrderNew });
    const catalogEq = vi.fn().mockReturnValue({ order: catalogOrderDrop });

    const from = vi.fn((table: string) => {
      if (table === 'prospects') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: prospectMaybeSingle }),
          }),
        };
      }
      if (table === 'lines') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: lineMaybeSingle }),
          }),
        };
      }
      if (table === 'catalog_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: catalogEq,
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    const supabase = { from } as unknown as AgentSupabase;

    const tools = createAgentCrmTools(supabase);
    const result = await tools.getAccountProductFit.execute!({ prospectId: 12 }, toolOpts);

    expect(from).toHaveBeenCalledWith('prospects');
    expect(from).toHaveBeenCalledWith('lines');
    expect(from).toHaveBeenCalledWith('catalog_items');
    expect(catalogEq).toHaveBeenCalledWith('line_id', 'line-1');
    expect(catalogLimit).toHaveBeenCalledWith(12);
    expect(result).toEqual({ prospect, line, catalogAnchors: anchors });
  });

  it('getAccountProductFit returns not-found when prospect missing', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'prospects') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    const supabase = { from } as unknown as AgentSupabase;

    const tools = createAgentCrmTools(supabase);
    const result = await tools.getAccountProductFit.execute!({ prospectId: 99 }, toolOpts);

    expect(result).toEqual({ error: 'Prospect not found' });
  });

  it('getAccountProductFit returns error when line missing', async () => {
    const prospect = {
      id: 12,
      name: 'Coastal Golf',
      category: 'golf_retail',
      region: 'Vancouver Island',
      city: 'Nanaimo',
      fit: 'Strong',
    };
    const from = vi.fn((table: string) => {
      if (table === 'prospects') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: prospect, error: null }),
            }),
          }),
        };
      }
      if (table === 'lines') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    const supabase = { from } as unknown as AgentSupabase;

    const tools = createAgentCrmTools(supabase);
    const result = await tools.getAccountProductFit.execute!(
      { prospectId: 12, lineCode: 'missing' },
      toolOpts,
    );

    expect(result).toEqual({ error: 'Line not found for code "missing"' });
  });

  it('getReorderSuggestions computes cadence, upserts settings, and returns pitch', async () => {
    const prospect = {
      id: 5,
      name: 'Kelowna Golf',
      category: 'golf_retail',
      region: 'Okanagan',
      city: 'Kelowna',
      fit: 'Strong',
      account_status: 'active_account',
    };
    const orders = [
      {
        order_date: '2026-03-01',
        season: 'fathers_day',
        total_amount_cad: 1200,
        order_type: 'initial',
        status: 'submitted',
      },
    ];
    const settings = {
      account_id: 5,
      last_order_date: '2026-03-01',
      next_suggested_contact_date: null,
      seasonal_cadence_tags: [],
      ai_reorder_notes: null,
    };
    const upsert = vi.fn().mockResolvedValue({ error: null });

    const from = vi.fn((table: string) => {
      if (table === 'prospects') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: prospect, error: null }),
            }),
          }),
        };
      }
      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: orders, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'account_reorder_settings') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: settings, error: null }),
            }),
          }),
          upsert,
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    const supabase = { from } as unknown as AgentSupabase;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 1));

    const tools = createAgentCrmTools(supabase);
    const result = await tools.getReorderSuggestions.execute!({ accountId: 5 }, toolOpts);

    vi.useRealTimers();

    expect(result).toMatchObject({
      nextSuggestedContactDate: '2026-05-10',
      seasonalCadenceTags: ['fathers_day'],
      lastOrderDate: '2026-03-01',
    });
    expect(result).toHaveProperty('aiReorderNotes');
    if (!('error' in (result as object)) && result && 'aiReorderNotes' in result) {
      expect(
        String(result.aiReorderNotes)
          .split(/(?<=\.)\s+/)
          .filter(Boolean),
      ).toHaveLength(2);
    }
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: 5,
        last_order_date: '2026-03-01',
        next_suggested_contact_date: '2026-05-10',
        seasonal_cadence_tags: ['fathers_day'],
      }),
      { onConflict: 'account_id' },
    );
  });
});
