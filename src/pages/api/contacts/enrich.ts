import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { createEnrichedContact } from '@/lib/createEnrichedContact';

export const prerender = false;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  let body: {
    contactName?: unknown;
    companyName?: unknown;
    phone?: unknown;
    email?: unknown;
    websiteUrl?: unknown;
    mode?: unknown;
    accountId?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const contactName = typeof body.contactName === 'string' ? body.contactName.trim() : '';
  if (!contactName) {
    return jsonError('Contact name is required', 400);
  }

  const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
  if (!companyName) {
    return jsonError('Company name is required', 400);
  }

  const mode = body.mode === 'attach' ? 'attach' : 'create_prospect';
  const accountId =
    typeof body.accountId === 'number' && Number.isFinite(body.accountId)
      ? body.accountId
      : typeof body.accountId === 'string' && body.accountId.trim()
        ? Number(body.accountId)
        : undefined;

  if (mode === 'attach' && (accountId == null || !Number.isFinite(accountId))) {
    return jsonError('Account id is required to attach a contact', 400);
  }

  const phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : undefined;
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : undefined;
  const websiteUrl =
    typeof body.websiteUrl === 'string' && body.websiteUrl.trim()
      ? body.websiteUrl.trim()
      : undefined;

  const result = await createEnrichedContact(gate.supabase, {
    contactName,
    companyName,
    phone,
    email,
    websiteUrl,
    mode,
    accountId,
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
