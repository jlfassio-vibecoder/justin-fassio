-- Idempotent backfill: existing wholesale_order_requests → message_threads + messages.
-- Safe to re-run; skips requests that already have a messages row.

with unlinked as (
  select
    wor.*,
    lower(trim(regexp_replace(coalesce(wor.email, ''), '\s+', ' ', 'g')))
      || '|'
      || lower(trim(regexp_replace(coalesce(wor.business_name, ''), '\s+', ' ', 'g')))
      || '|'
      || lower(trim(regexp_replace(coalesce(wor.buyer_name, ''), '\s+', ' ', 'g')))
      as identity_fingerprint,
    coalesce(wor.request_number, '') || ' · ' || coalesce(wor.business_name, '') as subject
  from wholesale_order_requests wor
  where not exists (
    select 1
    from messages m
    where m.wholesale_order_request_id = wor.id
  )
),
ins_threads as (
  insert into message_threads (
    identity_fingerprint,
    mapping_status,
    prospect_id,
    source,
    subject,
    last_message_at
  )
  select distinct on (u.identity_fingerprint)
    u.identity_fingerprint,
    'unmapped',
    null,
    'old-guys-rule-wholesale',
    u.subject,
    u.created_at
  from unlinked u
  where not exists (
    select 1
    from message_threads t
    where t.identity_fingerprint = u.identity_fingerprint
  )
  order by u.identity_fingerprint, u.created_at desc
  returning id, identity_fingerprint
),
all_threads as (
  select id, identity_fingerprint from ins_threads
  union all
  select t.id, t.identity_fingerprint
  from message_threads t
  where t.identity_fingerprint in (select identity_fingerprint from unlinked)
),
line_payloads as (
  select
    u.id as order_request_id,
    u.identity_fingerprint,
    u.request_number,
    u.business_name,
    u.buyer_name,
    u.email,
    u.phone,
    u.city,
    u.province,
    u.postal_code,
    u.retail_channel,
    u.is_existing_customer,
    u.website,
    u.gst_hst_number,
    u.po_number,
    u.notes,
    u.preferred_contact_method,
    u.total_units,
    u.merchandise_subtotal_usd,
    u.created_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'sku', i.sku,
            'name', i.name,
            'size', i.size,
            'wholesaleUsd', i.wholesale_usd,
            'quantity', i.quantity
          )
          order by i.sort_order
        )
        from wholesale_order_request_items i
        where i.order_request_id = u.id
      ),
      '[]'::jsonb
    ) as lines
  from unlinked u
)
insert into messages (
  thread_id,
  kind,
  wholesale_order_request_id,
  body,
  payload,
  created_at
)
select
  at.id,
  'wholesale_order_request',
  lp.order_request_id,
  'Wholesale order request '
    || coalesce(lp.request_number, '')
    || ': '
    || coalesce(lp.total_units::text, '0')
    || ' units, US$'
    || to_char(coalesce(lp.merchandise_subtotal_usd, 0), 'FM999999990.00')
    || ' — '
    || coalesce(lp.business_name, '')
    || ' ('
    || coalesce(lp.buyer_name, '')
    || ')',
  jsonb_build_object(
    'requestNumber', lp.request_number,
    'businessName', lp.business_name,
    'buyerName', lp.buyer_name,
    'email', lp.email,
    'phone', lp.phone,
    'city', lp.city,
    'province', lp.province,
    'postalCode', lp.postal_code,
    'retailChannel', lp.retail_channel,
    'isExistingCustomer', lp.is_existing_customer,
    'website', lp.website,
    'gstHstNumber', lp.gst_hst_number,
    'poNumber', lp.po_number,
    'notes', lp.notes,
    'preferredContactMethod', lp.preferred_contact_method,
    'totalUnits', lp.total_units,
    'merchandiseSubtotalUsd', lp.merchandise_subtotal_usd,
    'lines', lp.lines
  ),
  lp.created_at
from line_payloads lp
join all_threads at on at.identity_fingerprint = lp.identity_fingerprint;

-- Keep thread subjects / last_message_at current after backfill.
update message_threads t
set
  last_message_at = greatest(
    t.last_message_at,
    coalesce(
      (select max(m.created_at) from messages m where m.thread_id = t.id),
      t.last_message_at
    )
  ),
  subject = coalesce(
    (
      select
        coalesce(m.payload->>'requestNumber', '')
        || ' · '
        || coalesce(m.payload->>'businessName', t.subject)
      from messages m
      where m.thread_id = t.id
      order by m.created_at desc
      limit 1
    ),
    t.subject
  )
where t.source = 'old-guys-rule-wholesale';
