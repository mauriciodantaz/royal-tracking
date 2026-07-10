-- Royal Tracking — schema self-hosted (Postgres local / Swarm)
-- Sem Supabase Auth/RLS: só o app Node fala com o banco (rede Docker interna).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- users (Auth.js credentials)
-- ---------------------------------------------------------------------------
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_email_idx on users (email);

-- ---------------------------------------------------------------------------
-- settings (uma linha lógica)
-- ---------------------------------------------------------------------------
create table if not exists settings (
  id smallint primary key default 1 check (id = 1),
  webhook_token text,
  currency text not null default 'BRL',
  test_event_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into settings (id) values (1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Contas multi-destino (segredos = cipher text AES-GCM hex)
-- ---------------------------------------------------------------------------
create table if not exists ga4_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  measurement_id text not null,
  api_secret_cipher text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists meta_pixels (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  pixel_id text not null,
  capi_token_cipher text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists meta_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  ad_account_id text not null,
  ads_token_cipher text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- visitors
-- ---------------------------------------------------------------------------
create table if not exists visitors (
  id uuid primary key default gen_random_uuid(),
  trck_user_id text not null unique,
  email text,
  email_hash text,
  phone_hash text,
  first_name_hash text,
  last_name_hash text,
  city_hash text,
  state_hash text,
  country_hash text,
  external_id_hash text,
  fbp text,
  fbc text,
  ga_client_id text,
  ga_session_id text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  referrer text,
  ip text,
  user_agent text,
  geo_country text,
  geo_region text,
  geo_city text,
  pixel_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists visitors_created_at_idx on visitors (created_at desc);
create index if not exists visitors_email_hash_idx on visitors (email_hash) where email_hash is not null;
create index if not exists visitors_phone_hash_idx on visitors (phone_hash) where phone_hash is not null;

-- ---------------------------------------------------------------------------
-- events_log
-- ---------------------------------------------------------------------------
create table if not exists events_log (
  id uuid primary key default gen_random_uuid(),
  trck_user_id text,
  event_name text not null,
  event_id text not null unique,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  payload_meta jsonb,
  response_meta jsonb,
  payload_ga4 jsonb,
  response_ga4 jsonb,
  ip text,
  geo_country text,
  geo_region text,
  geo_city text,
  created_at timestamptz not null default now()
);

create index if not exists events_log_trck_user_id_idx on events_log (trck_user_id);
create index if not exists events_log_event_name_idx on events_log (event_name);
create index if not exists events_log_created_at_idx on events_log (created_at desc);

-- ---------------------------------------------------------------------------
-- purchases
-- ---------------------------------------------------------------------------
create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  transaction_id text not null unique,
  trck_user_id text,
  email text,
  email_hash text,
  phone_hash text,
  product_name text,
  product_id text,
  value numeric(12, 2),
  currency text default 'BRL',
  status text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  fbp text,
  fbc text,
  geo_country text,
  geo_region text,
  geo_city text,
  match_status text,
  match_reason text,
  meta_event_id text,
  response_meta jsonb,
  payload_meta jsonb,
  response_ga4 jsonb,
  payload_ga4 jsonb,
  ga_client_id text,
  webhook_raw jsonb,
  sent_meta_at timestamptz,
  sent_ga4_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists purchases_trck_user_id_idx on purchases (trck_user_id);
create index if not exists purchases_created_at_idx on purchases (created_at desc);
create index if not exists purchases_status_idx on purchases (status);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists settings_updated_at on settings;
create trigger settings_updated_at before update on settings
for each row execute function set_updated_at();

drop trigger if exists users_updated_at on users;
create trigger users_updated_at before update on users
for each row execute function set_updated_at();

drop trigger if exists ga4_accounts_updated_at on ga4_accounts;
create trigger ga4_accounts_updated_at before update on ga4_accounts
for each row execute function set_updated_at();

drop trigger if exists meta_pixels_updated_at on meta_pixels;
create trigger meta_pixels_updated_at before update on meta_pixels
for each row execute function set_updated_at();

drop trigger if exists meta_ad_accounts_updated_at on meta_ad_accounts;
create trigger meta_ad_accounts_updated_at before update on meta_ad_accounts
for each row execute function set_updated_at();

drop trigger if exists visitors_updated_at on visitors;
create trigger visitors_updated_at before update on visitors
for each row execute function set_updated_at();

drop trigger if exists purchases_updated_at on purchases;
create trigger purchases_updated_at before update on purchases
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Retenção de payloads (chamar via cron externo ou job no app)
-- ---------------------------------------------------------------------------
create or replace function purge_old_event_payloads(batch_size integer default 500)
returns integer
language plpgsql
as $$
declare
  affected integer;
begin
  with doomed as (
    select id
    from events_log
    where created_at < now() - interval '14 days'
      and (
        payload_meta is not null
        or response_meta is not null
        or payload_ga4 is not null
        or response_ga4 is not null
      )
    order by created_at
    limit batch_size
    for update skip locked
  )
  update events_log e
  set
    payload_meta = null,
    response_meta = null,
    payload_ga4 = null,
    response_ga4 = null
  from doomed d
  where e.id = d.id;

  get diagnostics affected = row_count;
  return affected;
end;
$$;
