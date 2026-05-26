-- 18_activity_and_webhooks.sql
--
-- Two append-only audit tables.
--
-- activity_events — user-visible "who did what when" feed surfaced on the
-- company Dashboard and a dedicated /company/activity page. Populated from
-- our write endpoints (cf-benefits POST/PUT/PATCH, cf-benefit-assign,
-- cf-employees, etc.). Cheap insert, never updated.
--
-- webhook_events — forensic log of every inbound webhook (e.g. GonnaOrder).
-- Lets us replay/debug, and is the source of truth for idempotency dedup
-- (same external_order_id + status arriving twice are deduped).

create table if not exists public.activity_events (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid references public.companies(id) on delete cascade,
  actor_user_id   uuid,
  actor_email     text,
  kind            text not null,        -- e.g. 'benefit.created', 'employee.deactivated'
  target_type     text,                  -- e.g. 'benefit', 'employee', 'assignment'
  target_id       uuid,
  summary_el      text,
  summary_en      text,
  payload         jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_activity_company_time on public.activity_events(company_id, created_at desc);
create index if not exists idx_activity_kind on public.activity_events(kind);

create table if not exists public.webhook_events (
  id                  uuid primary key default gen_random_uuid(),
  source              text not null default 'gonnaorder',
  event_type          text,
  external_order_id   text,
  dedupe_key          text unique,        -- typically source||event_type||external_order_id
  payload             jsonb not null,
  processed           boolean not null default false,
  error               text,
  received_at         timestamptz not null default now()
);
create index if not exists idx_webhook_external on public.webhook_events(external_order_id);
create index if not exists idx_webhook_unprocessed on public.webhook_events(received_at) where processed = false;
