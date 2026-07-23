-- First-party short links (/r/{slug}) for WhatsApp CTAs

create table if not exists tracked_links (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text,
  phone_digits text not null,
  message_template text not null default '',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  connection_id uuid references integration_connections (id) on delete set null,
  click_count integer not null default 0,
  active boolean not null default true,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tracked_links_active_idx
  on tracked_links (active) where active = true;
