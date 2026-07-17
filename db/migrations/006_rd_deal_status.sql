-- RD CRM: map Meta/GA4 by deal status (won/lost) + emit-once claim

alter table rd_stage_event_maps
  add column if not exists deal_status text;

alter table rd_stage_event_maps
  drop constraint if exists rd_stage_event_maps_key_chk;

alter table rd_stage_event_maps
  add constraint rd_stage_event_maps_key_chk check (
    (
      stage_external_id is not null
      and mkt_lifecycle is null
      and deal_status is null
    )
    or (
      stage_external_id is null
      and mkt_lifecycle is not null
      and deal_status is null
    )
    or (
      stage_external_id is null
      and mkt_lifecycle is null
      and deal_status is not null
      and deal_status in ('won', 'lost')
    )
  );

create unique index if not exists rd_stage_event_maps_status_uidx
  on rd_stage_event_maps (connection_id, deal_status)
  where deal_status is not null;

alter table rd_deal_state
  add column if not exists last_status text;

create table if not exists rd_deal_status_emits (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references integration_connections (id) on delete cascade,
  deal_external_id text not null,
  deal_status text not null,
  event_id text not null,
  created_at timestamptz not null default now(),
  unique (connection_id, deal_external_id, deal_status),
  constraint rd_deal_status_emits_status_chk check (deal_status in ('won', 'lost'))
);

create index if not exists rd_deal_status_emits_connection_idx
  on rd_deal_status_emits (connection_id);

create index if not exists rd_deal_status_emits_event_id_idx
  on rd_deal_status_emits (event_id);
