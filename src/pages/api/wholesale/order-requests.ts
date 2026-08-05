import type { APIRoute } from 'astro';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';
import { wholesaleOrderRequestBodySchema } from '@/lib/wholesaleOrderRequestSchema';
import { checkWholesaleOrderRateLimit } from '@/lib/wholesaleOrderRateLimit';
import { orderTotals, type WholesaleOrderLine } from '@/lib/wholesaleOrderDraft';
import {
  buildWholesaleActivityNote,
  matchOrCreateWholesaleProspect,
} from '@/lib/wholesaleProspectMatch';
import { sendWholesaleOrderConfirmation } from '@/lib/wholesaleOrderEmail';
import { upsertWholesaleInboundMessage } from '@/lib/messageCenterInbound';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function clientKey(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'anonymous'
  );
}

export const POST: APIRoute = async ({ request }) => {
  const limited = checkWholesaleOrderRateLimit(`wholesale-order:${clientKey(request)}`);
  if (!limited.ok) {
    return new Response(JSON.stringify({ ok: false, error: 'Rate limit exceeded' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(limited.retryAfterSec),
      },
    });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const parsed = wholesaleOrderRequestBodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' }, 400);
  }

  const body = parsed.data;

  // Honeypot: pretend success without writing.
  if (body.companyFax && body.companyFax.trim().length > 0) {
    return json({ ok: true, requestNumber: 'W-2026-000000' });
  }

  const admin = getServiceRoleClient();
  if (!admin) {
    return json(
      {
        ok: false,
        error:
          'Order submission is not configured (missing SUPABASE_SERVICE_ROLE_KEY). Contact office@justinfassio.com.',
      },
      503,
    );
  }

  // Idempotent replay — skip CRM / email side effects
  const { data: existing } = await admin
    .from('wholesale_order_requests')
    .select('request_number')
    .eq('idempotency_key', body.idempotencyKey)
    .maybeSingle();
  if (existing?.request_number) {
    return json({ ok: true, requestNumber: existing.request_number });
  }

  const draftLines: WholesaleOrderLine[] = body.lines.map((l) => ({
    ...l,
    primaryImageUrl: null,
  }));
  const { totalUnits, merchandiseSubtotalUsd } = orderTotals({
    lines: draftLines,
    updatedAt: new Date().toISOString(),
  });

  const { data: inserted, error: insertError } = await admin
    .from('wholesale_order_requests')
    .insert({
      business_name: body.businessName,
      buyer_name: body.buyerName,
      email: body.email,
      phone: body.phone,
      city: body.city,
      province: body.province,
      postal_code: body.postalCode,
      retail_channel: body.retailChannel,
      is_existing_customer: body.isExistingCustomer,
      website: body.website || null,
      gst_hst_number: body.gstHstNumber || null,
      po_number: body.poNumber || null,
      notes: body.notes || null,
      preferred_contact_method: body.preferredContactMethod || null,
      source: 'old-guys-rule-wholesale',
      status: 'submitted',
      idempotency_key: body.idempotencyKey,
      merchandise_subtotal_usd: merchandiseSubtotalUsd,
      total_units: totalUnits,
    })
    .select('id, request_number')
    .single();

  if (insertError || !inserted) {
    if (insertError?.code === '23505') {
      const { data: again } = await admin
        .from('wholesale_order_requests')
        .select('request_number')
        .eq('idempotency_key', body.idempotencyKey)
        .maybeSingle();
      if (again?.request_number) {
        return json({ ok: true, requestNumber: again.request_number });
      }
    }
    return json(
      { ok: false, error: insertError?.message ?? 'Failed to create order request' },
      500,
    );
  }

  const itemRows = body.lines.map((line, index) => ({
    order_request_id: inserted.id,
    catalog_item_id: line.productId,
    sku: line.sku,
    name: line.name,
    size: line.size,
    wholesale_usd: line.wholesaleUsd,
    quantity: line.quantity,
    sort_order: index,
  }));

  const { error: itemsError } = await admin.from('wholesale_order_request_items').insert(itemRows);
  if (itemsError) {
    await admin.from('wholesale_order_requests').delete().eq('id', inserted.id);
    return json({ ok: false, error: itemsError.message }, 500);
  }

  // CRM: match/create prospect (never activate) + activity note
  const match = await matchOrCreateWholesaleProspect(admin, {
    businessName: body.businessName,
    buyerName: body.buyerName,
    email: body.email,
    phone: body.phone,
    city: body.city,
    province: body.province,
    website: body.website,
    retailChannel: body.retailChannel,
    isExistingCustomer: body.isExistingCustomer,
  });

  if (match.ok) {
    const { error: linkError } = await admin
      .from('wholesale_order_requests')
      .update({ prospect_id: match.prospectId })
      .eq('id', inserted.id);
    if (linkError) {
      console.error('[wholesale-order-requests] prospect link failed', linkError.message);
    } else {
      const note = buildWholesaleActivityNote({
        requestNumber: inserted.request_number,
        totalUnits,
        merchandiseSubtotalUsd,
        skus: body.lines.map((l) => l.sku),
      });
      const { error: activityError } = await admin.from('prospect_updates').insert({
        prospect_id: match.prospectId,
        status: 'submitted',
        note,
      });
      if (activityError) {
        console.error('[wholesale-order-requests] activity failed', activityError.message);
      }
    }
  } else {
    console.error('[wholesale-order-requests] prospect match failed', match.error);
  }

  // Message Center: create/append thread (best-effort; does not fail the submission)
  const messageResult = await upsertWholesaleInboundMessage(admin, {
    orderRequestId: inserted.id,
    requestNumber: inserted.request_number,
    businessName: body.businessName,
    buyerName: body.buyerName,
    email: body.email,
    phone: body.phone,
    city: body.city,
    province: body.province,
    postalCode: body.postalCode,
    retailChannel: body.retailChannel,
    isExistingCustomer: body.isExistingCustomer,
    website: body.website,
    gstHstNumber: body.gstHstNumber,
    poNumber: body.poNumber,
    notes: body.notes,
    preferredContactMethod: body.preferredContactMethod,
    totalUnits,
    merchandiseSubtotalUsd,
    lines: body.lines.map((l) => ({
      sku: l.sku,
      name: l.name,
      size: l.size,
      wholesaleUsd: l.wholesaleUsd,
      quantity: l.quantity,
    })),
  });
  if (!messageResult.ok) {
    console.error('[wholesale-order-requests] message center failed', messageResult.error);
  }

  // Email is best-effort; CRM activity remains system of record when Resend is unset.
  void sendWholesaleOrderConfirmation({
    requestNumber: inserted.request_number,
    buyerName: body.buyerName,
    buyerEmail: body.email,
    businessName: body.businessName,
    totalUnits,
    merchandiseSubtotalUsd,
    lines: body.lines.map((l) => ({
      sku: l.sku,
      name: l.name,
      size: l.size,
      quantity: l.quantity,
      wholesaleUsd: l.wholesaleUsd,
    })),
  });

  return json({ ok: true, requestNumber: inserted.request_number });
};
