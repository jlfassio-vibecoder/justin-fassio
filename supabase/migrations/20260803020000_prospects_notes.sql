-- Account-level freeform notes (shared by Prospect + Active Account drawers).
alter table prospects add column if not exists notes text;
