-- Fase 1: schema tracking, RLS, pgcrypto, retenção
-- Projeto: tdgaitwvakzztcbodwfm (aplicar via CLI / SQL Editor — sem MCP)
-- Idempotente: pode reexecutar após tentativa parcial.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Crypto helpers (hex text — compatível com PostgREST/JS)
-- DROP primeiro: CREATE OR REPLACE não muda return type (bytea → text).
-- ---------------------------------------------------------------------------
drop function if exists public.encrypt_secret(text, text);
drop function if exists public.decrypt_secret(bytea, text);
drop function if exists public.decrypt_secret(text, text);

create function public.encrypt_secret(plain text, secret_key text)
returns text
language sql
immutable
security definer
set search_path = public, extensions
as $$
  select encode(extensions.pgp_sym_encrypt(plain, secret_key), 'hex');
$$;

create function public.decrypt_secret(cipher text, secret_key text)
returns text
language sql
immutable
security definer
set search_path = public, extensions
as $$
  select extensions.pgp_sym_decrypt(decode(cipher, 'hex'), secret_key);
$$;

revoke all on function public.encrypt_secret(text, text) from public, anon, authenticated;
revoke all on function public.decrypt_secret(text, text) from public, anon, authenticated;
grant execute on function public.encrypt_secret(text, text) to service_role;
grant execute on function public.decrypt_secret(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- settings (uma linha lógica)
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  id smallint primary key default 1 check (id = 1),
  webhook_token text,
  currency text not null default 'BRL',
  test_event_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.settings (id) values (1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Contas multi-destino (segredos = hex text)
-- ---------------------------------------------------------------------------
create table if not exists public.ga4_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  measurement_id text not null,
  api_secret_cipher text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meta_pixels (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  pixel_id text not null,
  capi_token_cipher text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meta_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  ad_account_id text not null,
  ads_token_cipher text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Se a tentativa anterior criou colunas bytea, converte para text hex
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ga4_accounts'
      and column_name = 'api_secret_cipher' and data_type = 'bytea'
  ) then
    alter table public.ga4_accounts
      alter column api_secret_cipher type text using encode(api_secret_cipher, 'hex');
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meta_pixels'
      and column_name = 'capi_token_cipher' and data_type = 'bytea'
  ) then
    alter table public.meta_pixels
      alter column capi_token_cipher type text using encode(capi_token_cipher, 'hex');
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meta_ad_accounts'
      and column_name = 'ads_token_cipher' and data_type = 'bytea'
  ) then
    alter table public.meta_ad_accounts
      alter column ads_token_cipher type text using encode(ads_token_cipher, 'hex');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- visitors
-- ---------------------------------------------------------------------------
create table if not exists public.visitors (
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

create index if not exists visitors_created_at_idx on public.visitors (created_at desc);
create index if not exists visitors_email_hash_idx on public.visitors (email_hash) where email_hash is not null;
create index if not exists visitors_phone_hash_idx on public.visitors (phone_hash) where phone_hash is not null;

-- ---------------------------------------------------------------------------
-- events_log
-- ---------------------------------------------------------------------------
create table if not exists public.events_log (
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

create index if not exists events_log_trck_user_id_idx on public.events_log (trck_user_id);
create index if not exists events_log_event_name_idx on public.events_log (event_name);
create index if not exists events_log_created_at_idx on public.events_log (created_at desc);

-- ---------------------------------------------------------------------------
-- purchases
-- ---------------------------------------------------------------------------
create table if not exists public.purchases (
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

create index if not exists purchases_trck_user_id_idx on public.purchases (trck_user_id);
create index if not exists purchases_created_at_idx on public.purchases (created_at desc);
create index if not exists purchases_status_idx on public.purchases (status);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists settings_updated_at on public.settings;
create trigger settings_updated_at before update on public.settings
for each row execute function public.set_updated_at();

drop trigger if exists ga4_accounts_updated_at on public.ga4_accounts;
create trigger ga4_accounts_updated_at before update on public.ga4_accounts
for each row execute function public.set_updated_at();

drop trigger if exists meta_pixels_updated_at on public.meta_pixels;
create trigger meta_pixels_updated_at before update on public.meta_pixels
for each row execute function public.set_updated_at();

drop trigger if exists meta_ad_accounts_updated_at on public.meta_ad_accounts;
create trigger meta_ad_accounts_updated_at before update on public.meta_ad_accounts
for each row execute function public.set_updated_at();

drop trigger if exists visitors_updated_at on public.visitors;
create trigger visitors_updated_at before update on public.visitors
for each row execute function public.set_updated_at();

drop trigger if exists purchases_updated_at on public.purchases;
create trigger purchases_updated_at before update on public.purchases
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on table public.settings from public, anon, authenticated;
revoke all on table public.ga4_accounts from public, anon, authenticated;
revoke all on table public.meta_pixels from public, anon, authenticated;
revoke all on table public.meta_ad_accounts from public, anon, authenticated;
revoke all on table public.visitors from public, anon, authenticated;
revoke all on table public.events_log from public, anon, authenticated;
revoke all on table public.purchases from public, anon, authenticated;

grant select on table public.ga4_accounts,
  public.meta_pixels,
  public.meta_ad_accounts,
  public.visitors,
  public.events_log,
  public.purchases
  to authenticated;

grant all on table public.settings,
  public.ga4_accounts,
  public.meta_pixels,
  public.meta_ad_accounts,
  public.visitors,
  public.events_log,
  public.purchases
  to service_role;

create or replace view public.settings_public
with (security_invoker = true)
as
select
  id,
  currency,
  test_event_code,
  created_at,
  updated_at,
  (webhook_token is not null and length(webhook_token) > 0) as has_webhook_token
from public.settings;

revoke all on public.settings_public from public, anon;
grant select on public.settings_public to authenticated;
grant select on public.settings_public to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.settings enable row level security;
alter table public.ga4_accounts enable row level security;
alter table public.meta_pixels enable row level security;
alter table public.meta_ad_accounts enable row level security;
alter table public.visitors enable row level security;
alter table public.events_log enable row level security;
alter table public.purchases enable row level security;

-- Remove policies antigas (incl. settings_select_authenticated da 1ª tentativa)
drop policy if exists settings_select_authenticated on public.settings;
drop policy if exists ga4_accounts_select_authenticated on public.ga4_accounts;
drop policy if exists meta_pixels_select_authenticated on public.meta_pixels;
drop policy if exists meta_ad_accounts_select_authenticated on public.meta_ad_accounts;
drop policy if exists visitors_select_authenticated on public.visitors;
drop policy if exists events_log_select_authenticated on public.events_log;
drop policy if exists purchases_select_authenticated on public.purchases;

-- settings: SEM policy authenticated (só service_role)
create policy ga4_accounts_select_authenticated on public.ga4_accounts
  for select to authenticated using (true);
create policy meta_pixels_select_authenticated on public.meta_pixels
  for select to authenticated using (true);
create policy meta_ad_accounts_select_authenticated on public.meta_ad_accounts
  for select to authenticated using (true);
create policy visitors_select_authenticated on public.visitors
  for select to authenticated using (true);
create policy events_log_select_authenticated on public.events_log
  for select to authenticated using (true);
create policy purchases_select_authenticated on public.purchases
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Retenção
-- ---------------------------------------------------------------------------
create or replace function public.purge_old_event_payloads(batch_size integer default 500)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  with doomed as (
    select id
    from public.events_log
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
  update public.events_log e
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

revoke all on function public.purge_old_event_payloads(integer) from public, anon, authenticated;
grant execute on function public.purge_old_event_payloads(integer) to service_role;

do $$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception
    when others then
      raise notice 'pg_cron extension unavailable: %', sqlerrm;
      return;
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule(jobid)
      from cron.job
      where jobname = 'purge_events_log_payloads';
    exception
      when others then
        null;
    end;

    perform cron.schedule(
      'purge_events_log_payloads',
      '15 3 * * *',
      'select public.purge_old_event_payloads(1000);'
    );
  end if;
exception
  when others then
    raise notice 'pg_cron schedule skipped: %', sqlerrm;
end;
$$;
