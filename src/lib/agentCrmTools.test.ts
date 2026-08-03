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
      category: 'Golf',
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
    expect(select).toHaveBeenCalledWith('id,name,category,region,city,fit');
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
});
