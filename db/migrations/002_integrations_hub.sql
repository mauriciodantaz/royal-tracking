-- Hub de Integrações: connections multi-conta, mappings, delivery, forms/leads

-- ---------------------------------------------------------------------------
-- integration_connections (N por provider)
-- ---------------------------------------------------------------------------
create table if not exists integration_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  label text not null,
  auth_type text not null default 'token'
    check (auth_type in ('oauth', 'token', 'basic', 'webhook_secret', 'none')),
  direction text not null default 'outbound'
    check (direction in ('inbound', 'outbound', 'both')),
  access_token_cipher text,
  refresh_token_cipher text,
  expires_at timestamptz,
  webhook_secret_cipher text,
  account_external_id text,
  config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists integration_connections_provider_idx
  on integration_connections (provider);
create index if not exists integration_connections_active_idx
  on integration_connections (active) where active = true;

drop trigger if exists integration_connections_updated_at on integration_connections;
create trigger integration_connections_updated_at before update on integration_connections
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- event mappings (fonte → destino)
-- ---------------------------------------------------------------------------
create table if not exists integration_event_mappings (
  id uuid primary key default gen_random_uuid(),
  source_connection_id uuid references integration_connections(id) on delete cascade,
  source_provider text,
  source_event text not null,
  dest_connection_id uuid not null references integration_connections(id) on delete cascade,
  dest_event_name text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists integration_event_mappings_source_idx
  on integration_event_mappings (source_connection_id, source_event);
create index if not exists integration_event_mappings_provider_idx
  on integration_event_mappings (source_provider, source_event);

drop trigger if exists integration_event_mappings_updated_at on integration_event_mappings;
create trigger integration_event_mappings_updated_at before update on integration_event_mappings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- delivery log (fan-out por destino)
-- ---------------------------------------------------------------------------
create table if not exists integration_delivery_log (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  connection_id uuid references integration_connections(id) on delete set null,
  provider text not null,
  dest_event_name text,
  status text not null default 'pending',
  http_status int,
  request_payload jsonb,
  response_payload jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists integration_delivery_log_event_idx
  on integration_delivery_log (event_id);
create index if not exists integration_delivery_log_created_idx
  on integration_delivery_log (created_at desc);

-- ---------------------------------------------------------------------------
-- forms + leads
-- ---------------------------------------------------------------------------
create table if not exists forms (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  label text not null,
  page_url text,
  field_names jsonb not null default '[]'::jsonb,
  default_event_name text not null default 'Lead',
  active boolean not null default true,
  submission_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists forms_updated_at on forms;
create trigger forms_updated_at before update on forms
  for each row execute function set_updated_at();

create table if not exists form_leads (
  id uuid primary key default gen_random_uuid(),
  form_id uuid references forms(id) on delete set null,
  trck_user_id text,
  email text,
  phone text,
  email_hash text,
  phone_hash text,
  name text,
  fields jsonb not null default '{}'::jsonb,
  page_url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  fbp text,
  fbc text,
  ga_client_id text,
  source_provider text not null default 'snippet',
  source_connection_id uuid references integration_connections(id) on delete set null,
  consent boolean,
  raw_payload jsonb,
  event_id text unique,
  match_status text,
  match_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists form_leads_email_hash_idx on form_leads (email_hash);
create index if not exists form_leads_phone_hash_idx on form_leads (phone_hash);
create index if not exists form_leads_trck_idx on form_leads (trck_user_id);
create index if not exists form_leads_form_idx on form_leads (form_id);
create index if not exists form_leads_created_idx on form_leads (created_at desc);

drop trigger if exists form_leads_updated_at on form_leads;
create trigger form_leads_updated_at before update on form_leads
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Migrar Meta / GA4 / Meta Ads existentes → integration_connections
-- ---------------------------------------------------------------------------
insert into integration_connections (
  id, provider, label, auth_type, direction,
  access_token_cipher, account_external_id, config, active, created_at, updated_at
)
select
  id,
  'meta_pixel',
  label,
  'token',
  'outbound',
  capi_token_cipher,
  pixel_id,
  jsonb_build_object('pixel_id', pixel_id),
  active,
  created_at,
  updated_at
from meta_pixels
on conflict (id) do nothing;

insert into integration_connections (
  id, provider, label, auth_type, direction,
  access_token_cipher, account_external_id, config, active, created_at, updated_at
)
select
  id,
  'ga4',
  label,
  'token',
  'outbound',
  api_secret_cipher,
  measurement_id,
  jsonb_build_object('measurement_id', measurement_id),
  active,
  created_at,
  updated_at
from ga4_accounts
on conflict (id) do nothing;

insert into integration_connections (
  id, provider, label, auth_type, direction,
  access_token_cipher, account_external_id, config, active, created_at, updated_at
)
select
  id,
  'meta_ads',
  label,
  'token',
  'outbound',
  ads_token_cipher,
  ad_account_id,
  jsonb_build_object('ad_account_id', ad_account_id),
  active,
  created_at,
  updated_at
from meta_ad_accounts
on conflict (id) do nothing;

-- Conexão lógica do snippet (fonte site)
insert into integration_connections (
  provider, label, auth_type, direction, active, config
)
select 'snippet', 'Site / Forms (snippet)', 'none', 'inbound', true, '{}'::jsonb
where not exists (
  select 1 from integration_connections where provider = 'snippet' and label = 'Site / Forms (snippet)'
);

-- Mappings default: Lead/Purchase/PageView → todos Meta + GA4 ativos
insert into integration_event_mappings (
  source_provider, source_event, dest_connection_id, dest_event_name, enabled
)
select 'snippet', src.ev, c.id,
  case when c.provider = 'ga4' then
    case src.ev
      when 'Lead' then 'generate_lead'
      when 'Purchase' then 'purchase'
      when 'PageView' then 'page_view'
      else lower(src.ev)
    end
  else src.ev end,
  true
from integration_connections c
cross join (values ('Lead'), ('Purchase'), ('PageView')) as src(ev)
where c.provider in ('meta_pixel', 'ga4') and c.active = true
  and not exists (
    select 1 from integration_event_mappings m
    where m.source_provider = 'snippet'
      and m.source_event = src.ev
      and m.dest_connection_id = c.id
  );

insert into integration_event_mappings (
  source_provider, source_event, dest_connection_id, dest_event_name, enabled
)
select 'hotmart', 'Purchase', c.id,
  case when c.provider = 'ga4' then 'purchase' else 'Purchase' end,
  true
from integration_connections c
where c.provider in ('meta_pixel', 'ga4') and c.active = true
  and not exists (
    select 1 from integration_event_mappings m
    where m.source_provider = 'hotmart'
      and m.source_event = 'Purchase'
      and m.dest_connection_id = c.id
  );

insert into integration_event_mappings (
  source_provider, source_event, dest_connection_id, dest_event_name, enabled
)
select 'kiwify', 'Purchase', c.id,
  case when c.provider = 'ga4' then 'purchase' else 'Purchase' end,
  true
from integration_connections c
where c.provider in ('meta_pixel', 'ga4') and c.active = true
  and not exists (
    select 1 from integration_event_mappings m
    where m.source_provider = 'kiwify'
      and m.source_event = 'Purchase'
      and m.dest_connection_id = c.id
  );
