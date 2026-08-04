-- Planning / qualification columns from the BC named prospect list sheet.
-- Nullable so existing CRM rows and AI enrich writes remain valid without AI changes.

alter table prospects
  add column if not exists external_id text,
  add column if not exists subterritory text,
  add column if not exists primary_district text,
  add column if not exists retail_category text,
  add column if not exists website text,
  add column if not exists fit_score smallint,
  add column if not exists ideal_opening_units integer,
  add column if not exists priority text,
  add column if not exists provisional_grade text,
  add column if not exists verification_status text,
  add column if not exists buyer_verified boolean not null default false,
  add column if not exists apparel_capability text,
  add column if not exists existing_ogr text,
  add column if not exists qualification_status text,
  add column if not exists next_action text,
  add column if not exists source_note text;

alter table prospects
  drop constraint if exists prospects_fit_score_range;

alter table prospects
  add constraint prospects_fit_score_range
  check (fit_score is null or (fit_score >= 1 and fit_score <= 10));

create unique index if not exists prospects_external_id_uidx
  on prospects (external_id)
  where external_id is not null;
