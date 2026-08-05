import type { APIRoute } from 'astro';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';
import { wholesaleOrderRequestBodySchema } from '@/lib/wholesaleOrderRequestSchema';
import { checkWholesaleOrderRateLimit } from '@/lib/wholesaleOrderRateLimit';
import { orderTotals, type WholesaleOrderLine } from '@/lib/wholesaleOrderDraft';

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
    return json({ ok: false, error: 'Rate limit exceeded' }, 429);
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

  // Idempotent replay
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
    // Unique conflict on idempotency — re-fetch
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

  return json({ ok: true, requestNumber: inserted.request_number });
};
