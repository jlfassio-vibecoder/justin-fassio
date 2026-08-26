import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { ACCOUNT_CONTACT_ROLES } from '@/lib/accountContacts';
import { gateStaffAiContext, parseOptionalUuidField } from '@/lib/aiLineContext';
import { applyEnrichedContactAttach } from '@/lib/createEnrichedContact';
import type { AccountContactRole } from '@/types/database';

export const prerender = false;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseRole(value: unknown): AccountContactRole | null {
  if (typeof value !== 'string') return null;
  return (ACCOUNT_CONTACT_ROLES as readonly string[]).includes(value)
    ? (value as AccountContactRole)
    : null;
}

/** Apply staff-confirmed contact attach after preview. */
export const POST: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  let body: {
    accountId?: unknown;
    fullName?: unknown;
    title?: unknown;
    phone?: unknown;
    email?: unknown;
    role?: unknown;
    confirmDuplicateEmail?: unknown;
    salesLineId?: unknown;
    retailerLineAccountId?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const accountId =
    typeof body.accountId === 'number' && Number.isFinite(body.accountId)
      ? body.accountId
      : typeof body.accountId === 'string' && body.accountId.trim()
        ? Number(body.accountId)
        : NaN;

  if (!Number.isFinite(accountId)) {
    return jsonError('Account id is required', 400);
  }

  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  if (!fullName) {
    return jsonError('Contact name is required', 400);
  }

  const role = parseRole(body.role);
  if (!role) {
    return jsonError(`Role must be one of: ${ACCOUNT_CONTACT_ROLES.join(', ')}`, 400);
  }

  const gated = await gateStaffAiContext({
    client: gate.supabase,
    salesLineId: parseOptionalUuidField(body.salesLineId),
    retailerLineAccountId: parseOptionalUuidField(body.retailerLineAccountId),
    prospectId: accountId,
    kind: 'account',
  });
  if (!gated.ok) {
    return jsonError(gated.error, gated.status);
  }

  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : null;
  const phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null;
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null;
  const confirmDuplicateEmail = body.confirmDuplicateEmail === true;

  const result = await applyEnrichedContactAttach(gate.supabase, {
    accountId,
    fullName,
    title,
    phone,
    email,
    role,
    confirmDuplicateEmail,
    salesLineId: gated.ctx?.salesLineId,
    lineCode: gated.ctx?.code,
  });
  if (!result.ok) {
    return jsonError(result.error, 502);
  }

  return new Response(
    JSON.stringify({ ok: true, prospect: result.prospect, contact: result.contact }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
};
