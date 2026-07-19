-- Click IDs for paid attribution (Google / TikTok) on visitors.

alter table visitors
  add column if not exists gclid text,
  add column if not exists ttclid text;

create index if not exists visitors_gclid_idx
  on visitors (gclid) where gclid is not null;

create index if not exists visitors_ttclid_idx
  on visitors (ttclid) where ttclid is not null;
