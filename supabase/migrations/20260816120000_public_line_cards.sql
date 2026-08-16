-- Public homepage line cards for represented lines (OGR, Eagle Peak, Big Fish).
-- Does not flip lines.active. Does not add per-line product RPCs.

update lines
set
  public_showroom_path = coalesce(public_showroom_path, '/eagle-peak-wholesale'),
  tagline = coalesce(tagline, 'Now Repping'),
  updated_at = now()
where code = 'eagle-peak';

update lines
set
  public_showroom_path = coalesce(public_showroom_path, '/big-fish-wholesale'),
  tagline = coalesce(tagline, 'Coming soon'),
  updated_at = now()
where code = 'big-fish';

create or replace function public.get_public_line_cards()
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
  where l.code in ('ogr', 'eagle-peak', 'big-fish')
    and l.status in ('active', 'onboarding', 'confirmed')
  order by l.sort_order asc, l.name asc;
$$;

revoke all on function public.get_public_line_cards() from public;
grant execute on function public.get_public_line_cards() to anon, authenticated;
