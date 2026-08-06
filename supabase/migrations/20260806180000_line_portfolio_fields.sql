-- Line portfolio marketing fields (tagline, description, hero image) + public RPC.

alter table lines
  add column if not exists tagline text,
  add column if not exists description text,
  add column if not exists hero_image_path text,
  add column if not exists hero_image_url text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists public_showroom_path text;

update lines
set
  tagline = coalesce(tagline, 'Now Repping'),
  description = coalesce(
    description,
    'Apparel & lifestyle goods for the surf and skate crowd.'
  ),
  sort_order = case when code = 'ogr' then 10 when code = 'bkg' then 20 else sort_order end,
  public_showroom_path = coalesce(public_showroom_path, '/old-guys-rule-wholesale')
where code = 'ogr';

update lines
set sort_order = 20
where code = 'bkg' and sort_order = 0;

create or replace function public.get_public_active_lines()
returns table (
  id uuid,
  code text,
  name text,
  tagline text,
  description text,
  hero_image_url text,
  sort_order integer,
  public_showroom_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id,
    l.code,
    l.name,
    l.tagline,
    l.description,
    l.hero_image_url,
    l.sort_order,
    l.public_showroom_path
  from lines l
  where l.active = true
  order by l.sort_order asc, l.name asc;
$$;

revoke all on function public.get_public_active_lines() from public;
grant execute on function public.get_public_active_lines() to anon, authenticated;
