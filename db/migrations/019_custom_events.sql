-- Catálogo de eventos personalizados + aliases inbound + vínculo opcional nos funis CRM.

create table if not exists custom_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  meta_event_name text,
  ga4_event_name text,
  meta_enabled boolean not null default true,
  ga4_enabled boolean not null default true,
  include_value boolean not null default true,
  include_items boolean not null default false,
  default_currency text,
  default_params jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_events_slug_chk check (
    slug ~ '^[a-z][a-z0-9_]{1,63}$'
  )
);

create index if not exists custom_events_active_idx
  on custom_events (active) where active = true;

drop trigger if exists custom_events_updated_at on custom_events;
create trigger custom_events_updated_at before update on custom_events
  for each row execute function set_updated_at();

create table if not exists custom_event_aliases (
  id uuid primary key default gen_random_uuid(),
  custom_event_id uuid not null references custom_events (id) on delete cascade,
  source_provider text,
  received_name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists custom_event_aliases_global_uidx
  on custom_event_aliases (lower(received_name))
  where source_provider is null;

create unique index if not exists custom_event_aliases_provider_uidx
  on custom_event_aliases (source_provider, lower(received_name))
  where source_provider is not null;

create index if not exists custom_event_aliases_event_idx
  on custom_event_aliases (custom_event_id);

alter table pipedrive_stage_event_maps
  add column if not exists custom_event_id uuid references custom_events (id) on delete set null;

alter table rd_stage_event_maps
  add column if not exists custom_event_id uuid references custom_events (id) on delete set null;

create index if not exists pipedrive_stage_event_maps_custom_idx
  on pipedrive_stage_event_maps (custom_event_id)
  where custom_event_id is not null;

create index if not exists rd_stage_event_maps_custom_idx
  on rd_stage_event_maps (custom_event_id)
  where custom_event_id is not null;
