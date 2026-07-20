-- Royal FPID / server-managed GA4 client_id identity metadata
alter table visitors
  add column if not exists ga_client_id_source text,
  add column if not exists browser_ga_client_id text,
  add column if not exists ga_client_id_created_at timestamptz,
  add column if not exists ga_client_id_updated_at timestamptz;

update visitors
   set ga_client_id_source = 'visitor_stored',
       ga_client_id_created_at = coalesce(ga_client_id_created_at, created_at),
       ga_client_id_updated_at = coalesce(ga_client_id_updated_at, updated_at)
 where ga_client_id is not null
   and ga_client_id_source is null;
