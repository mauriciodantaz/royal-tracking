-- Emit once per (deal, pipeline, stage) — RD can spam webhooks for the same stage

create table if not exists rd_deal_stage_emits (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references integration_connections (id) on delete cascade,
  deal_external_id text not null,
  pipeline_external_id text not null default '',
  stage_external_id text not null,
  event_id text not null,
  created_at timestamptz not null default now(),
  unique (connection_id, deal_external_id, pipeline_external_id, stage_external_id)
);

create index if not exists rd_deal_stage_emits_connection_idx
  on rd_deal_stage_emits (connection_id);

create index if not exists rd_deal_stage_emits_event_id_idx
  on rd_deal_stage_emits (event_id);
