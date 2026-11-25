-- Catalog, hybrid storefronts, and service requests. Existing rental rows stay valid.

alter table businesses
  add column offers text not null default 'rental' check (offers in ('rental', 'service', 'both'));

alter table items
  add column kind text not null default 'product' check (kind in ('product', 'service'));

alter table items
  add column price_unit text not null default 'day' check (price_unit in ('hour', 'day', 'fixed', 'quote'));

alter table items
  add column template_id text;

create table catalog_categories (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind text not null check (kind in ('product', 'service')),
  name text not null,
  aliases text[] not null default '{}',
  image_url text,
  active boolean not null default true,
  restricted boolean not null default false,
  search text not null
);
create index catalog_categories_kind_idx on catalog_categories (kind) where active;

create table catalog_templates (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category_id text not null references catalog_categories (id),
  name text not null,
  description text not null,
  aliases text[] not null default '{}',
  image_url text,
  active boolean not null default true,
  search text not null
);
create index catalog_templates_category_idx on catalog_templates (category_id) where active;
create index catalog_templates_search_idx on catalog_templates (search);

create table catalog_image_jobs (
  template_id text primary key references catalog_templates (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts integer not null default 0,
  error text,
  updated_at timestamptz not null default now()
);

create table business_categories (
  business_id uuid not null references businesses (id) on delete cascade,
  category_id text not null references catalog_categories (id),
  primary key (business_id, category_id)
);

create table service_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id),
  item_id uuid not null references items (id),
  customer_id uuid not null references users (id),
  note text not null default '',
  status text not null default 'requested' check (status in ('requested', 'quoted', 'accepted', 'done', 'cancelled')),
  quote_cents integer check (quote_cents is null or quote_cents >= 0),
  created_at timestamptz not null default now()
);
create index service_requests_business_idx on service_requests (business_id, created_at desc);
create index service_requests_customer_idx on service_requests (customer_id, created_at desc);
