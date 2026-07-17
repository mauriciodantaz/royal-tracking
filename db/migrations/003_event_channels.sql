-- Web + server channel tracking for Stape-style dedup overview

alter table events_log
  add column if not exists ingest_path text not null default 'snippet';

alter table events_log
  add column if not exists web_meta boolean;

alter table events_log
  add column if not exists web_ga4 boolean;

alter table events_log
  add column if not exists server_meta boolean;

alter table events_log
  add column if not exists server_ga4 boolean;

alter table events_log
  add column if not exists channel_class text;

create index if not exists events_log_channel_created_idx
  on events_log (channel_class, created_at desc);

create index if not exists events_log_event_name_created_idx
  on events_log (event_name, created_at desc);
