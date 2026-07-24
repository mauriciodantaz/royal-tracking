-- Audit trail for sensitive admin actions (single-stack; no tenant_id).

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users (id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  ip text,
  result text not null check (result in ('ok', 'error')),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_created_at_idx
  on audit_events (created_at desc);

create index if not exists audit_events_actor_idx
  on audit_events (actor_user_id, created_at desc);

create index if not exists audit_events_resource_idx
  on audit_events (resource_type, resource_id);
