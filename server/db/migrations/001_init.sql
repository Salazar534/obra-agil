-- Obra Ágil schema. Money is stored in integer cents; the API speaks reais.

create table users (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('customer', 'business')),
  name text not null check (char_length(name) between 2 and 80),
  email text unique check (email = lower(email)),
  phone text unique check (phone ~ '^[1-9]{2}9[0-9]{8}$'), -- verified Brazilian mobile, digits only
  password_hash text,
  cpf text check (cpf ~ '^[0-9]{11}$'),
  photo_url text,
  prefs jsonb not null default '{"orders": true, "promos": false, "sounds": true}',
  tip_dismissed boolean not null default false,
  recent_searches text[] not null default '{}',
  active_address_id uuid,
  mp_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_can_sign_in check ((email is not null and password_hash is not null) or phone is not null)
);

create table addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  label text not null,
  detail text not null default '',
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  created_at timestamptz not null default now()
);
create index addresses_user_idx on addresses (user_id, created_at);

alter table users
  add constraint users_active_address_fk foreign key (active_address_id) references addresses (id) on delete set null;

create table sessions (
  id text primary key, -- sha256 of the cookie token
  user_id uuid not null references users (id) on delete cascade,
  user_agent text,
  ip text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user_idx on sessions (user_id);

-- One row per code sent. code_hash is null when Twilio Verify owns the code.
create table sms_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text,
  attempts integer not null default 0,
  ip text,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index sms_codes_phone_idx on sms_codes (phone, created_at desc);
create index sms_codes_ip_idx on sms_codes (ip, created_at desc);

-- Proof that a phone was verified, exchanged for a new account at sign-up.
create table phone_tickets (
  id text primary key, -- sha256 of the ticket
  phone text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table password_resets (
  id text primary key, -- sha256 of the emailed token
  user_id uuid not null references users (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  tagline text not null default '',
  about text not null default '',
  category text not null,
  cover_url text not null,
  logo_url text,
  phone text not null default '',
  address_label text not null,
  address_detail text not null default '',
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  opens text not null default '07:00' check (opens ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  closes text not null default '18:00' check (closes ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  delivery_fee_cents integer not null default 1500 check (delivery_fee_cents between 0 and 1000000),
  radius_km integer not null default 15 check (radius_km between 1 and 100),
  rating_sum integer not null default 0,
  rating_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index businesses_location_idx on businesses (lat, lng);

create table items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  category text not null,
  price_cents integer not null check (price_cents between 1 and 100000000),
  deposit_cents integer not null default 0 check (deposit_cents between 0 and 100000000),
  description text not null default '',
  specs text[] not null default '{}',
  image_url text not null,
  quantity integer not null default 1 check (quantity between 1 and 999),
  available boolean not null default true,
  rentals integer not null default 0,
  search text not null default '', -- lowercase, accent-free text for search
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_business_idx on items (business_id) where deleted_at is null;

create table favorites (
  user_id uuid not null references users (id) on delete cascade,
  kind text not null check (kind in ('item', 'business')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, target_id)
);

-- Cards saved in the user's Mercado Pago customer. Only display data is kept here.
create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  mp_card_id text not null,
  payment_method_id text not null,
  brand text not null,
  issuer_id text,
  first_six text not null check (first_six ~ '^[0-9]{6,8}$'),
  last_four text not null check (last_four ~ '^[0-9]{4}$'),
  exp_month integer not null check (exp_month between 1 and 12),
  exp_year integer not null,
  holder text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, mp_card_id)
);

create sequence order_number_seq start 1001;

create table orders (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique default nextval('order_number_seq'),
  customer_id uuid not null references users (id),
  business_id uuid not null references businesses (id),
  item_id uuid not null references items (id),
  item_name text not null,
  item_image_url text not null,
  price_cents integer not null,
  start_date date not null,
  days integer not null check (days between 1 and 90),
  mode text not null check (mode in ('delivery', 'pickup')),
  address_label text not null,
  address_detail text not null default '',
  lat double precision not null,
  lng double precision not null,
  rent_cents integer not null,
  delivery_fee_cents integer not null,
  service_fee_cents integer not null,
  deposit_cents integer not null,
  total_cents integer not null,
  status text not null check (
    status in ('awaiting_payment', 'pending', 'accepted', 'on_the_way', 'delivered', 'returned', 'declined', 'cancelled')
  ),
  payment_method text not null check (payment_method in ('card', 'pix')),
  payment_label text not null,
  installments integer not null default 1 check (installments between 1 and 24),
  payment_status text not null default 'pending' check (
    payment_status in ('pending', 'approved', 'rejected', 'cancelled', 'refunded', 'partially_refunded')
  ),
  payment_detail text,
  mp_payment_id text unique,
  pix_qr_code text,
  pix_qr_base64 text,
  pix_ticket_url text,
  pix_expires_at timestamptz,
  refunded_cents integer not null default 0,
  refund_due_cents integer not null default 0, -- refunds still to send to Mercado Pago (retried in the background)
  read_customer_at timestamptz not null default now(),
  read_business_at timestamptz not null default 'epoch',
  reviewed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_customer_idx on orders (customer_id, created_at desc);
create index orders_business_idx on orders (business_id, created_at desc);
create index orders_item_period_idx on orders (item_id, start_date);
create index orders_awaiting_idx on orders (created_at) where status = 'awaiting_payment';
create index orders_refund_due_idx on orders (updated_at) where refund_due_cents > 0;

create table order_events (
  id bigserial primary key,
  order_id uuid not null references orders (id) on delete cascade,
  status text not null,
  actor_id uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on order_events (order_id, id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  sender_id uuid not null references users (id),
  sender_role text not null check (sender_role in ('customer', 'business')),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_order_idx on messages (order_id, created_at);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders (id) on delete cascade,
  business_id uuid not null references businesses (id) on delete cascade,
  author_id uuid not null references users (id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  body text not null default '' check (char_length(body) <= 500),
  created_at timestamptz not null default now()
);
create index reviews_business_idx on reviews (business_id, created_at desc);

create table uploads (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  kind text not null,
  file text not null,
  bytes integer not null,
  created_at timestamptz not null default now()
);

create table webhook_events (
  id bigserial primary key,
  provider text not null,
  topic text,
  resource_id text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
