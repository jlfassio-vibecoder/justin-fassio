import { requireApprovedOwnerClient, type AgentSupabase } from '@/lib/agentAuth';
import { ACCOUNT_IMPORT_SOURCE_TYPES } from '@/lib/accountImport/classification';
import { assertImportLineAllowed, parseRequiredSalesLineId } from '@/lib/accountImport/lineGate';
import { parseWorkbookBuffer, sha256Hex } from '@/lib/accountImport/parseWorkbook';
import { isUuid } from '@/lib/resolveSalesLineQuery';
import type { AccountImportSourceType } from '@/types/database';

export function jsonAccountImport(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function requireAccountImportOwner(request: Request) {
  return requireApprovedOwnerClient(request);
}

export async function gateImportSalesLine(
  supabase: AgentSupabase,
  salesLineIdRaw: unknown,
): Promise<{ ok: true; salesLineId: string } | { ok: false; response: Response }> {
  const parsed = parseRequiredSalesLineId(salesLineIdRaw);
  if (!parsed.ok)
    return {
      ok: false,
      response: jsonAccountImport({ ok: false, error: parsed.error }, parsed.status),
    };

  const { data: line, error } = await supabase
    .from('lines')
    .select('id, code, status')
    .eq('id', parsed.salesLineId)
    .maybeSingle();
  if (error)
    return { ok: false, response: jsonAccountImport({ ok: false, error: error.message }, 500) };
  if (!line)
    return {
      ok: false,
      response: jsonAccountImport({ ok: false, error: 'Unknown sales line' }, 400),
    };
  const allowed = assertImportLineAllowed(line);
  if (!allowed.ok) {
    return {
      ok: false,
      response: jsonAccountImport({ ok: false, error: allowed.error }, allowed.status),
    };
  }
  return { ok: true, salesLineId: parsed.salesLineId };
}

export async function requireAccountImportBatch(
  request: Request,
  params: { id?: string },
  salesLineIdRaw: unknown,
) {
  const owner = await requireAccountImportOwner(request);
  if (!owner.ok) return owner;
  const batchId = typeof params.id === 'string' ? params.id.trim() : '';
  if (!batchId || !isUuid(batchId)) {
    return {
      ok: false as const,
      response: jsonAccountImport({ ok: false, error: 'Invalid batch id' }, 400),
    };
  }
  const line = await gateImportSalesLine(owner.supabase, salesLineIdRaw);
  if (!line.ok) return line;
  return {
    ok: true as const,
    supabase: owner.supabase,
    userId: owner.userId,
    salesLineId: line.salesLineId,
    batchId,
  };
}

export function parseRetailerIds(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = raw
    .map((value) =>
      typeof value === 'number' && Number.isFinite(value)
        ? Math.floor(value)
        : typeof value === 'string' && value.trim()
          ? Number(value)
          : NaN,
    )
    .filter((id) => Number.isFinite(id) && id > 0);
  return ids.length > 0 ? ids : undefined;
}

export function parseSourceType(raw: unknown): AccountImportSourceType | null {
  if (typeof raw === 'string' && (ACCOUNT_IMPORT_SOURCE_TYPES as readonly string[]).includes(raw)) {
    return raw as AccountImportSourceType;
  }
  return null;
}

export async function parseUploadedWorkbook(input: {
  bytes: Uint8Array;
  filename: string;
  clientSha256?: string | null;
}) {
  const serverHash = sha256Hex(input.bytes);
  if (input.clientSha256 && input.clientSha256 !== serverHash) {
    return { ok: false as const, error: 'File hash did not match' };
  }
  const parsed = await parseWorkbookBuffer({ bytes: input.bytes, filename: input.filename });
  if (!parsed.ok) return parsed;
  return { ok: true as const, workbook: parsed.workbook, contentSha256: serverHash };
}
