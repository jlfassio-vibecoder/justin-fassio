-- Enrich pending wholesale buyer list for staff approval; hide system/test profiles.

drop function if exists public.list_pending_wholesale_buyers();

create or replace function public.list_pending_wholesale_buyers()
returns table (
  id uuid,
  email text,
  display_name text,
  prospect_id integer,
  prospect_name text,
  prospect_city text,
  business_name text,
  buyer_name text,
  phone text,
  wholesale_pricing_unlocked boolean,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.email,
    p.display_name,
    p.prospect_id,
    pr.name as prospect_name,
    pr.city as prospect_city,
    wor.business_name,
    wor.buyer_name,
    wor.phone,
    p.wholesale_pricing_unlocked,
    p.status,
    p.created_at
  from public.profiles p
  join public.prospects pr on pr.id = p.prospect_id
  left join lateral (
    select
      r.business_name,
      r.buyer_name,
      r.phone
    from public.wholesale_order_requests r
    where r.prospect_id = p.prospect_id
       or (p.email is not null and lower(r.email) = lower(p.email))
    order by r.created_at desc
    limit 1
  ) wor on true
  where public.is_approved_staff()
    and p.role = 'buyer'
    and p.prospect_id is not null
    and (
      p.wholesale_pricing_unlocked = false
      or p.status = 'pending'
    )
    and (
      p.email is null
      or (
        p.email not like 'livechat.%'
        and p.email not like '%@users.noreply.justinfassio.com'
        and p.email not like '%@example.com'
      )
    )
  order by p.created_at asc;
$$;

revoke all on function public.list_pending_wholesale_buyers() from public;
grant execute on function public.list_pending_wholesale_buyers() to authenticated;
