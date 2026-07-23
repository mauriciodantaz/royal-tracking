-- Dual PK identity (email OR phone) + first-touch attribution window support

alter table visitors
  add column if not exists first_lead_at timestamptz,
  add column if not exists merged_into_trck_user_id text,
  add column if not exists ft_utm_source text,
  add column if not exists ft_utm_medium text,
  add column if not exists ft_utm_campaign text,
  add column if not exists ft_utm_term text,
  add column if not exists ft_utm_content text,
  add column if not exists ft_referrer text,
  add column if not exists ft_fbp text,
  add column if not exists ft_fbc text,
  add column if not exists ft_gclid text,
  add column if not exists ft_ttclid text,
  add column if not exists ft_ctwa_clid text,
  add column if not exists ft_wbraid text,
  add column if not exists ft_gbraid text;

create index if not exists visitors_merged_into_idx
  on visitors (merged_into_trck_user_id)
  where merged_into_trck_user_id is not null;

create index if not exists visitors_first_lead_at_idx
  on visitors (first_lead_at)
  where first_lead_at is not null;

-- Best-effort backfill for existing PII rows
update visitors
set
  first_lead_at = coalesce(first_lead_at, created_at),
  ft_utm_source = coalesce(ft_utm_source, utm_source),
  ft_utm_medium = coalesce(ft_utm_medium, utm_medium),
  ft_utm_campaign = coalesce(ft_utm_campaign, utm_campaign),
  ft_utm_term = coalesce(ft_utm_term, utm_term),
  ft_utm_content = coalesce(ft_utm_content, utm_content),
  ft_referrer = coalesce(ft_referrer, referrer),
  ft_fbp = coalesce(ft_fbp, fbp),
  ft_fbc = coalesce(ft_fbc, fbc),
  ft_gclid = coalesce(ft_gclid, gclid),
  ft_ttclid = coalesce(ft_ttclid, ttclid),
  ft_ctwa_clid = coalesce(ft_ctwa_clid, ctwa_clid),
  ft_wbraid = coalesce(ft_wbraid, wbraid),
  ft_gbraid = coalesce(ft_gbraid, gbraid)
where
  merged_into_trck_user_id is null
  and (email_hash is not null or phone_hash is not null)
  and first_lead_at is null;
