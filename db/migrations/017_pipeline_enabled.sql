-- Allow disabling CRM pipelines in the UI (and skip webhook emits when disabled).

alter table rd_pipelines
  add column if not exists enabled boolean not null default true;

alter table pipedrive_pipelines
  add column if not exists enabled boolean not null default true;
