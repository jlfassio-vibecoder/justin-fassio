import { requireApprovedOwnerClient, type AgentSupabase } from '@/lib/agentAuth';
import { jsonAccountImport } from '@/lib/accountImport/http';
import { LOOKALIKE_LINE_CODE } from '@/lib/lookalike/classification';
import { parseRequiredSalesLineId } from '@/lib/accountImport/lineGate';
import { isRepresentedLineStatus } from '@/lib/lines';
import { isUuid } from '@/lib/resolveSalesLineQuery';

export function jsonLookalike(body: unknown, status = 200): Response {
  return jsonAccountImport(body, status);
}

export async function requireLookalikeOwner(request: Request) {
  return requireApprovedOwnerClient(request);
}

export async function parseLookalikeJson(
  request: Request,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return { ok: true, body };
  } catch {
    return {
      ok: false,
      response: jsonLookalike({ ok: false, error: 'Invalid JSON body' }, 400),
    };
  }
}

export async function requireLookalikeJob(
  request: Request,
  params: { id?: string },
  salesLineIdRaw: unknown,
): Promise<
  | {
      ok: true;
      supabase: AgentSupabase;
      userId: string;
      jobId: string;
      salesLineId: string;
    }
  | { ok: false; response: Response }
> {
  const owner = await requireLookalikeOwner(request);
  if (!owner.ok) return owner;
  const jobId = typeof params.id === 'string' ? params.id.trim() : '';
  if (!jobId || !isUuid(jobId)) {
    return {
      ok: false,
      response: jsonLookalike({ ok: false, error: 'Invalid job id' }, 400),
    };
  }
  const { data: job, error } = await owner.supabase
    .from('lookalike_jobs')
    .select('id, sales_line_id')
    .eq('id', jobId)
    .maybeSingle();
  if (error) {
    return { ok: false, response: jsonLookalike({ ok: false, error: error.message }, 500) };
  }
  if (!job) {
    return {
      ok: false,
      response: jsonLookalike({ ok: false, error: 'Unknown lookalike job' }, 404),
    };
  }
  const line = await gateLookalikeOgrLine(owner.supabase, job.sales_line_id);
  if (!line.ok) return line;
  if (typeof salesLineIdRaw === 'string' && salesLineIdRaw.trim()) {
    const parsed = parseRequiredSalesLineId(salesLineIdRaw);
    if (!parsed.ok) {
      return {
        ok: false,
        response: jsonLookalike({ ok: false, error: parsed.error }, parsed.status),
      };
    }
    if (parsed.salesLineId !== job.sales_line_id) {
      return {
        ok: false,
        response: jsonLookalike({ ok: false, error: 'sales_line_id does not match this job' }, 400),
      };
    }
  }
  return {
    ok: true,
    supabase: owner.supabase,
    userId: owner.userId,
    jobId,
    salesLineId: job.sales_line_id,
  };
}

export async function gateLookalikeOgrLine(
  supabase: AgentSupabase,
  salesLineIdRaw: unknown,
): Promise<{ ok: true; salesLineId: string } | { ok: false; response: Response }> {
  const parsed = parseRequiredSalesLineId(salesLineIdRaw);
  if (!parsed.ok) {
    return {
      ok: false,
      response: jsonLookalike({ ok: false, error: parsed.error }, parsed.status),
    };
  }
  const { data: line, error } = await supabase
    .from('lines')
    .select('id, code, status')
    .eq('id', parsed.salesLineId)
    .maybeSingle();
  if (error) {
    return { ok: false, response: jsonLookalike({ ok: false, error: error.message }, 500) };
  }
  if (!line) {
    return { ok: false, response: jsonLookalike({ ok: false, error: 'Unknown sales line' }, 400) };
  }
  if (!isRepresentedLineStatus(line.status, line.code) || line.code !== LOOKALIKE_LINE_CODE) {
    return {
      ok: false,
      response: jsonLookalike(
        { ok: false, error: 'Lookalike discovery is only available for Old Guys Rule' },
        400,
      ),
    };
  }
  return { ok: true, salesLineId: parsed.salesLineId };
}
