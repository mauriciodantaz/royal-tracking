-- Multi-user roles, invite/reset tokens, integration alert cooldowns

alter table users
  alter column password_hash drop not null;

alter table users
  add column if not exists role text not null default 'manager',
  add column if not exists active boolean not null default true,
  add column if not exists invited_at timestamptz,
  add column if not exists password_set_at timestamptz;

alter table users drop constraint if exists users_role_check;
alter table users
  add constraint users_role_check check (role in ('super_admin', 'manager'));

-- Boot seed syncs ADMIN_EMAIL → role = super_admin.

create table if not exists auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null,
  purpose text not null check (purpose in ('invite', 'reset')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auth_tokens_user_id_idx on auth_tokens (user_id);
create index if not exists auth_tokens_token_hash_idx on auth_tokens (token_hash);
create index if not exists auth_tokens_purpose_expires_idx on auth_tokens (purpose, expires_at);

create table if not exists integration_alert_cooldowns (
  connection_id uuid primary key,
  last_alerted_at timestamptz not null default now()
);
