-- Ephemeral live-chat users (email/password) should be buyer/pending, not rep.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_chat boolean;
begin
  is_chat :=
    coalesce(new.is_anonymous, false)
    or coalesce((new.raw_user_meta_data->>'live_chat')::boolean, false)
    or coalesce(new.raw_user_meta_data->>'live_chat', '') = 'true';

  insert into public.profiles (id, email, display_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    case when is_chat then 'buyer' else 'rep' end,
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
