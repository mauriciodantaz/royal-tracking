-- CTWA + click IDs on visitors/leads (Tintim parity foundation)

alter table visitors
  add column if not exists ctwa_clid text,
  add column if not exists wbraid text,
  add column if not exists gbraid text;

create index if not exists visitors_ctwa_clid_idx
  on visitors (ctwa_clid) where ctwa_clid is not null;

create index if not exists visitors_wbraid_idx
  on visitors (wbraid) where wbraid is not null;

create index if not exists visitors_gbraid_idx
  on visitors (gbraid) where gbraid is not null;

alter table form_leads
  add column if not exists gclid text,
  add column if not exists ttclid text,
  add column if not exists ctwa_clid text;

create index if not exists form_leads_gclid_idx
  on form_leads (gclid) where gclid is not null;

create index if not exists form_leads_ctwa_clid_idx
  on form_leads (ctwa_clid) where ctwa_clid is not null;
