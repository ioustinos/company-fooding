-- Migration 03 — benefits + assignments + ledger + topups (E2.3)
--
-- Creates enums: topup_cadence, carryover_mode, topup_status
-- Creates tables: benefits, benefit_rules, benefit_assignments,
--                 benefit_ledger, benefit_topups
--
-- Key idempotency contract:
--   benefit_topups is unique on (assignment_id, scheduled_for). The scheduler
--   retries the same (assignment, date) up to three times (05:00 / 08:00 /
--   12:00) and every attempt writes to the SAME row.

do $$ begin
  create type topup_cadence as enum ('daily', 'weekly', 'monthly', 'one_time');
exception when duplicate_object then null; end $$;

do $$ begin
  create type carryover_mode as enum ('reset', 'accumulate');
exception when duplicate_object then null; end $$;

do $$ begin
  create type topup_status as enum ('pending', 'applied', 'skipped', 'failed');
exception when duplicate_object then null; end $$;

-- ------------------------------ Benefits --------------------------------

create table if not exists public.benefits (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  name_el         text not null,
  name_en         text not null,
  description_el  text,
  description_en  text,
  type            benefit_type not null,
  credit_amount   int not null check (credit_amount >= 0),   -- cents
  currency        text not null default 'EUR',
  status          benefit_status not null default 'active',
  priority        int not null default 100,                  -- lower = applied first
  valid_from      date not null,
  valid_to        date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_benefits_company on public.benefits(company_id);
create index if not exists idx_benefits_status  on public.benefits(status);

create table if not exists public.benefit_rules (
  id                   uuid primary key default gen_random_uuid(),
  benefit_id           uuid not null references public.benefits(id) on delete cascade,
  daily_cap            int,                   -- cents, nullable = no cap
  per_order_min        int,                   -- cents
  per_order_max        int,                   -- cents
  days_of_week         smallint[],            -- 1..7, null = all
  blackout_dates       date[] not null default '{}',
  allowed_vendor_ids   uuid[],
  allowed_tags         text[],
  blocked_tags         text[],
  topup_cadence        topup_cadence not null,
  topup_amount         int not null check (topup_amount >= 0),  -- cents added per tick
  carryover            carryover_mode not null default 'reset',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (benefit_id)
);

create table if not exists public.benefit_assignments (
  id                        uuid primary key default gen_random_uuid(),
  benefit_id                uuid not null references public.benefits(id)  on delete cascade,
  employee_id               uuid references public.employees(id)          on delete cascade,
  group_label               text,
  assigned_at               timestamptz not null default now(),
  unassigned_at             timestamptz,
  gonnaorder_voucher_code   text,            -- minted once on first top-up
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check (employee_id is not null or group_label is not null)
);
create index if not exists idx_assignments_benefit  on public.benefit_assignments(benefit_id);
create index if not exists idx_assignments_employee on public.benefit_assignments(employee_id);
create index if not exists idx_assignments_active
  on public.benefit_assignments(benefit_id, employee_id)
  where unassigned_at is null;

create table if not exists public.benefit_ledger (
  id                uuid primary key default gen_random_uuid(),
  benefit_id        uuid not null references public.benefits(id)  on delete cascade,
  employee_id       uuid not null references public.employees(id) on delete cascade,
  cycle_start       date not null,
  cycle_end         date not null,
  granted_amount    int not null default 0 check (granted_amount >= 0),
  redeemed_amount   int not null default 0 check (redeemed_amount >= 0),
  updated_at        timestamptz not null default now(),
  unique (benefit_id, employee_id, cycle_start)
);
create index if not exists idx_ledger_employee on public.benefit_ledger(employee_id);

-- benefit_topups — scheduler's working table. UNIQUE(assignment_id,
-- scheduled_for) is the idempotency contract.
create table if not exists public.benefit_topups (
  id                       uuid primary key default gen_random_uuid(),
  assignment_id            uuid not null references public.benefit_assignments(id) on delete cascade,
  benefit_id               uuid not null references public.benefits(id)            on delete cascade,
  employee_id              uuid not null references public.employees(id)           on delete cascade,
  scheduled_for            date not null,
  amount                   int not null check (amount >= 0),      -- cents
  status                   topup_status not null default 'pending',
  gonnaorder_voucher_code  text,
  applied_at               timestamptz,
  error_detail             text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (assignment_id, scheduled_for)
);
create index if not exists idx_topups_status_scheduled
  on public.benefit_topups(status, scheduled_for);
create index if not exists idx_topups_employee on public.benefit_topups(employee_id);

alter table public.benefits             enable row level security;
alter table public.benefit_rules        enable row level security;
alter table public.benefit_assignments  enable row level security;
alter table public.benefit_ledger       enable row level security;
alter table public.benefit_topups       enable row level security;
