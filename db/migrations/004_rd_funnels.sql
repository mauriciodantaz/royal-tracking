-- RD Station: funis, estágios, mapeamento → Meta/GA4, estado de deal (anti-dup)

create table if not exists rd_pipelines (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references integration_connections (id) on delete cascade,
  external_id text not null,
  name text not null,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_id)
);

create index if not exists rd_pipelines_connection_idx
  on rd_pipelines (connection_id);

create table if not exists rd_stages (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references integration_connections (id) on delete cascade,
  pipeline_id uuid references rd_pipelines (id) on delete cascade,
  external_id text not null,
  name text not null,
  stage_order integer not null default 0,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_id)
);

create index if not exists rd_stages_connection_idx
  on rd_stages (connection_id);

create index if not exists rd_stages_pipeline_idx
  on rd_stages (pipeline_id);

create table if not exists rd_stage_event_maps (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references integration_connections (id) on delete cascade,
  stage_external_id text,
  mkt_lifecycle text,
  meta_event_name text,
  ga4_event_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rd_stage_event_maps_key_chk check (
    (stage_external_id is not null and mkt_lifecycle is null)
    or (stage_external_id is null and mkt_lifecycle is not null)
  )
);

create unique index if not exists rd_stage_event_maps_crm_uidx
  on rd_stage_event_maps (connection_id, stage_external_id)
  where stage_external_id is not null;

create unique index if not exists rd_stage_event_maps_mkt_uidx
  on rd_stage_event_maps (connection_id, mkt_lifecycle)
  where mkt_lifecycle is not null;

create index if not exists rd_stage_event_maps_connection_idx
  on rd_stage_event_maps (connection_id);

create table if not exists rd_deal_state (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references integration_connections (id) on delete cascade,
  deal_external_id text not null,
  last_stage_external_id text,
  contact_email_hash text,
  updated_at timestamptz not null default now(),
  unique (connection_id, deal_external_id)
);

create index if not exists rd_deal_state_connection_idx
  on rd_deal_state (connection_id);
