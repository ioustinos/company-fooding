-- Migration 06 — system tables + audit log (E2.6)
--
-- settings — jsonb key/value bag. Seeds per SPEC §4.7.
-- audit_log — append-only log of every privileged mutation.

create table if not exists public.settings (
  key          text primary key,
  value        jsonb not null,
  description  text,
  updated_at   timestamptz not null default now()
);

-- Seed required keys (insert-if-absent so re-runs are safe).
insert into public.settings (key, value, description) values
  ('supported_langs',   '["el","en"]'::jsonb,  'Available UI languages'),
  ('default_lang',      '"el"'::jsonb,          'Default UI language'),
  ('min_order_cents',   '0'::jsonb,             'Global minimum order amount (cents). Per-agreement override on matchmaking_agreements.settings.'),
  ('invoice_grace_days','14'::jsonb,            'Days after period_end before an unreceived invoice is flagged.')
on conflict (key) do nothing;

-- Append-only audit log. Every Netlify Function writes one row on success.
create table if not exists public.audit_log (
  id             uuid primary key default gen_random_uuid(),
  actor_user_id  uuid references auth.users(id) on delete set null,
  actor_role     text,            -- 'cf_owner', 'company_admin', 'employee', etc.
  action         text not null,   -- e.g. 'company.create', 'benefit.assign'
  entity_table   text not null,
  entity_id      uuid,
  before         jsonb,
  after          jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_audit_log_actor    on public.audit_log(actor_user_id);
create index if not exists idx_audit_log_entity   on public.audit_log(entity_table, entity_id);
create index if not exists idx_audit_log_created  on public.audit_log(created_at desc);

alter table public.settings  enable row level security;
alter table public.audit_log enable row level security;
