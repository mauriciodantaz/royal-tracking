-- Pipedrive: funis, estágios, mapeamento → Meta/GA4, emit-once por estágio/status

create table if not exists pipedrive_pipelines (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references integration_connections (id) on delete cascade,
  external_id text not null,
  name text not null,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_id)
);

create index if not exists pipedrive_pipelines_connection_idx
  on pipedrive_pipelines (connection_id);

create table if not exists pipedrive_stages (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references integration_connections (id) on delete cascade,
  pipeline_id uuid references pipedrive_pipelines (id) on delete cascade,
  external_id text not null,
  name text not null,
  stage_order integer not null default 0,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_id)
);

create index if not exists pipedrive_stages_connection_idx
  on pipedrive_stages (connection_id);

create index if not exists pipedrive_stages_pipeline_idx
  on pipedrive_stages (pipeline_id);

create table if not exists pipedrive_stage_event_maps (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references integration_connections (id) on delete cascade,
  stage_external_id text,
  deal_status text,
  meta_event_name text,
  ga4_event_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pipedrive_stage_event_maps_key_chk check (
    (
      stage_external_id is not null
      and deal_status is null
    )
    or (
      stage_external_id is null
      and deal_status is not null
      and deal_status in ('won', 'lost')
    )
  )
);

create unique index if not exists pipedrive_stage_event_maps_crm_uidx
  on pipedrive_stage_event_maps (connection_id, stage_external_id)
  where stage_external_id is not null;

create unique index if not exists pipedrive_stage_event_maps_status_uidx
  on pipedrive_stage_event_maps (connection_id, deal_status)
  where deal_status is not null;

create index if not exists pipedrive_stage_event_maps_connection_idx
  on pipedrive_stage_event_maps (connection_id);

create table if not exists pipedrive_deal_state (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references integration_connections (id) on delete cascade,
  deal_external_id text not null,
  last_stage_external_id text,
  last_status text,
  contact_email_hash text,
  updated_at timestamptz not null default now(),
  unique (connection_id, deal_external_id)
);

create index if not exists pipedrive_deal_state_connection_idx
  on pipedrive_deal_state (connection_id);

create table if not exists pipedrive_deal_stage_emits (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references integration_connections (id) on delete cascade,
  deal_external_id text not null,
  pipeline_external_id text not null default '',
  stage_external_id text not null,
  event_id text not null,
  created_at timestamptz not null default now(),
  unique (connection_id, deal_external_id, pipeline_external_id, stage_external_id)
);

create index if not exists pipedrive_deal_stage_emits_connection_idx
  on pipedrive_deal_stage_emits (connection_id);

create index if not exists pipedrive_deal_stage_emits_event_id_idx
  on pipedrive_deal_stage_emits (event_id);

create table if not exists pipedrive_deal_status_emits (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references integration_connections (id) on delete cascade,
  deal_external_id text not null,
  deal_status text not null,
  event_id text not null,
  created_at timestamptz not null default now(),
  unique (connection_id, deal_external_id, deal_status),
  constraint pipedrive_deal_status_emits_status_chk check (deal_status in ('won', 'lost'))
);

create index if not exists pipedrive_deal_status_emits_connection_idx
  on pipedrive_deal_status_emits (connection_id);

create index if not exists pipedrive_deal_status_emits_event_id_idx
  on pipedrive_deal_status_emits (event_id);
