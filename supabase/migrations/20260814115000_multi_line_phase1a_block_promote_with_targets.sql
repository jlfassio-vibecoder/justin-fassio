-- Phase 1A fix: block leaving prospective status while retailer_line_targets exist.
-- Promotion must be an explicit later workflow that clears/archives targets first.
-- Does not auto-convert or delete targets.

create or replace function public.enforce_lines_leave_prospective_without_targets()
returns trigger
language plpgsql
as $$
declare
  target_count integer;
begin
  if old.status = 'prospective' and new.status is distinct from 'prospective' then
    select count(*) into target_count
    from retailer_line_targets
    where sales_line_id = old.id;

    if target_count > 0 then
      raise exception
        'Cannot change line % from prospective while % retailer_line_targets exist; clear or archive targets before promotion',
        old.code,
        target_count;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists lines_leave_prospective_without_targets on lines;
create trigger lines_leave_prospective_without_targets
  before update of status on lines
  for each row execute function public.enforce_lines_leave_prospective_without_targets();
