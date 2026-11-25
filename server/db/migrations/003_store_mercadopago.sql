alter table businesses
  add column mp_user_id text,
  add column mp_access_token text,
  add column mp_refresh_token text,
  add column mp_public_key text,
  add column mp_expires_at timestamptz;

create table mp_oauth_states (
  state text primary key,
  business_id uuid not null references businesses (id) on delete cascade,
  expires_at timestamptz not null
);
