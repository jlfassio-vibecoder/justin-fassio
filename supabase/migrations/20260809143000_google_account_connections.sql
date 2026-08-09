-- Phase A: Google Workspace OAuth connection per staff profile.
-- Refresh tokens are stored encrypted (ciphertext); APIs use the service role
-- after requireApprovedStaffClient so clients never read token material.

create table if not exists google_account_connections (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  google_sub text not null,
  google_email text not null,
  refresh_token_ciphertext text not null,
  scopes text[] not null default '{}'::text[],
  status text not null default 'active'
    check (status in ('active', 'revoked', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_account_connections_profile_id_uidx unique (profile_id)
);

create index if not exists google_account_connections_google_sub_idx
  on google_account_connections (google_sub);

drop trigger if exists google_account_connections_set_updated_at on google_account_connections;
create trigger google_account_connections_set_updated_at
  before update on google_account_connections
  for each row execute function set_updated_at();

alter table google_account_connections enable row level security;

-- No authenticated policies: browser clients must not SELECT ciphertext.
-- Staff Google APIs authorize via requireApprovedStaffClient, then use the
-- service-role client for token storage and status reads.
