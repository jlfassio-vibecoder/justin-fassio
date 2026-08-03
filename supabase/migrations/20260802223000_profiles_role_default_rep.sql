-- Ensure migrated DBs that already applied the approval workflow still get
-- role default 'rep' (original profiles migration defaulted to 'buyer').
-- Safe to re-run.

alter table profiles alter column role set default 'rep';
