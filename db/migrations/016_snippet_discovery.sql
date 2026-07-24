-- Snippet discovery: field classification, canonical URLs, rules/flags on settings

alter table forms
  add column if not exists field_classification jsonb not null default '{}'::jsonb;

alter table events_log
  add column if not exists canonical_url text;

alter table form_leads
  add column if not exists canonical_url text;

create index if not exists events_log_canonical_url_created_idx
  on events_log (canonical_url, created_at desc);

alter table settings
  add column if not exists snippet_rules jsonb not null default '[]'::jsonb;

alter table settings
  add column if not exists url_preserve_params jsonb not null default '[]'::jsonb;

alter table settings
  add column if not exists auto_ecommerce boolean not null default false;

alter table settings
  add column if not exists listen_datalayer boolean not null default false;
