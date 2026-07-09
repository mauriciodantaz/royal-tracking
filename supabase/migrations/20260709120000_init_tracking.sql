-- Fase 1: schema tracking, RLS, pgcrypto, retenção
-- Projeto: tdgaitwvakzztcbodwfm (aplicar via CLI / SQL Editor — sem MCP)

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------------
-- Crypto helpers (chave passada pelo servidor; nunca gravada no banco)
-- ---------------------------------------------------------------------------
create or replace function public.encrypt_secret(plain text, secret_key text)
returns bytea
language sql
immutable
security definer
set search_path = public, extensions
as $$
  select extensions.pgp_sym_encrypt(plain, secret_key);
$$;

create or replace function public.decrypt_secret(cipher bytea, secret_key text)
returns text
language sql
immutable
security definer
set search_path = public, extensions
as $$
  select extensions.pgp_sym_decrypt(cipher, secret_key);
$$;

revoke all on function public.encrypt_secret(text, text) from public, anon, authenticated;
revoke all on function public.decrypt_secret(bytea, text) from public, anon, authenticated;
grant execute on function public.encrypt_secret(text, text) to service_role;
grant execute on function public.decrypt_secret(bytea, text) to service_role;

-- ---------------------------------------------------------------------------
-- settings (uma linha lógica)
-- ---------------------------------------------------------------------------
create table public.settings (
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
-- Contas multi-destino
-- ---------------------------------------------------------------------------
create table public.ga4_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  measurement_id text not null,
  api_secret_cipher bytea,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meta_pixels (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  pixel_id text not null,
  capi_token_cipher bytea,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meta_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  ad_account_id text not null,
  ads_token_cipher bytea,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- visitors
-- ---------------------------------------------------------------------------
create table public.visitors (
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

create index visitors_created_at_idx on public.visitors (created_at desc);
create index visitors_email_hash_idx on public.visitors (email_hash) where email_hash is not null;
create index visitors_phone_hash_idx on public.visitors (phone_hash) where phone_hash is not null;

-- ---------------------------------------------------------------------------
-- events_log
-- ---------------------------------------------------------------------------
create table public.events_log (
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

create index events_log_trck_user_id_idx on public.events_log (trck_user_id);
create index events_log_event_name_idx on public.events_log (event_name);
create index events_log_created_at_idx on public.events_log (created_at desc);

-- ---------------------------------------------------------------------------
-- purchases
-- ---------------------------------------------------------------------------
create table public.purchases (
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

create index purchases_trck_user_id_idx on public.purchases (trck_user_id);
create index purchases_created_at_idx on public.purchases (created_at desc);
create index purchases_status_idx on public.purchases (status);

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

create trigger settings_updated_at before update on public.settings
for each row execute function public.set_updated_at();
create trigger ga4_accounts_updated_at before update on public.ga4_accounts
for each row execute function public.set_updated_at();
create trigger meta_pixels_updated_at before update on public.meta_pixels
for each row execute function public.set_updated_at();
create trigger meta_ad_accounts_updated_at before update on public.meta_ad_accounts
for each row execute function public.set_updated_at();
create trigger visitors_updated_at before update on public.visitors
for each row execute function public.set_updated_at();
create trigger purchases_updated_at before update on public.purchases
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: leitura autenticada; escrita só service_role (bypass RLS)
-- ---------------------------------------------------------------------------
alter table public.settings enable row level security;
alter table public.ga4_accounts enable row level security;
alter table public.meta_pixels enable row level security;
alter table public.meta_ad_accounts enable row level security;
alter table public.visitors enable row level security;
alter table public.events_log enable row level security;
alter table public.purchases enable row level security;

create policy settings_select_authenticated on public.settings
  for select to authenticated using (true);
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

-- Grants: authenticated SELECT; service_role full (default)
grant select on public.settings, public.ga4_accounts, public.meta_pixels,
  public.meta_ad_accounts, public.visitors, public.events_log, public.purchases
  to authenticated;
grant all on public.settings, public.ga4_accounts, public.meta_pixels,
  public.meta_ad_accounts, public.visitors, public.events_log, public.purchases
  to service_role;

-- ---------------------------------------------------------------------------
-- Retenção: zera payloads pesados > 14 dias (mantém a linha)
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

-- Agenda diária (pg_cron). Se a extensão não estiver disponível no plano, ignore este bloco no SQL Editor.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'purge_events_log_payloads';

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
