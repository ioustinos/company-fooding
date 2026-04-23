-- Migration 02 — matchmaking (E2.2)
--
-- Creates:
--   matchmaking_agreements  — one row per (company, vendor) pairing
--   agreement_offices       — delivery windows per office
--   agreement_shops         — GonnaOrder shops surfaced under this agreement

create table if not exists public.matchmaking_agreements (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  vendor_id             uuid not null references public.vendors(id)   on delete cascade,
  status                agreement_status not null default 'active',
  sticker_mode          sticker_mode not null default 'employee_name',
  reusable_containers   text not null default 'optional'
                          check (reusable_containers in ('enforced', 'optional', 'disabled')),
  start_date            date not null,
  end_date              date,
  notes                 text,
  settings              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_agreements_company on public.matchmaking_agreements(company_id);
create index if not exists idx_agreements_vendor  on public.matchmaking_agreements(vendor_id);
create index if not exists idx_agreements_status  on public.matchmaking_agreements(status);

create table if not exists public.agreement_offices (
  id                    uuid primary key default gen_random_uuid(),
  agreement_id          uuid not null references public.matchmaking_agreements(id) on delete cascade,
  office_id             uuid not null references public.company_offices(id)        on delete cascade,
  delivery_time_from    time not null,
  delivery_time_to      time not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_agreement_offices_agreement on public.agreement_offices(agreement_id);

create table if not exists public.agreement_shops (
  id                    uuid primary key default gen_random_uuid(),
  agreement_id          uuid not null references public.matchmaking_agreements(id) on delete cascade,
  gonnaorder_shop_id    text not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (gonnaorder_shop_id)        -- globally unique per SPEC §4.3
);
create index if not exists idx_agreement_shops_agreement on public.agreement_shops(agreement_id);

alter table public.matchmaking_agreements enable row level security;
alter table public.agreement_offices       enable row level security;
alter table public.agreement_shops         enable row level security;
