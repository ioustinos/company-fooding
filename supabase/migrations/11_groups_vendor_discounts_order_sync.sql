-- Migration 11 — first-class groups + vendor discount model + GonnaOrder sync fields
--
-- Motivated by the Base44 implementation review (2026-04-24):
--   1. Employees belong to Groups (e.g. 'ENG', 'SALES'). Benefits can be
--      assigned to a group, to individuals, or to all employees.
--   2. Vendors carry a negotiated discount (percentage + whether it applies
--      to the benefit price or the final price). This changes invoice math.
--   3. GonnaOrder webhook/poll payloads include fields we weren't capturing:
--      external UUID (cross-store dedup), order_token, voucher_code.
--
-- Safe to run against an empty public.* schema (no rows yet). Idempotent.

-- ---------- 1. employee_groups table ------------------------------------

create table if not exists public.employee_groups (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  name_el      text not null,
  name_en      text not null,
  code         text not null,          -- short, e.g. 'ENG', 'SALES', 'ALL' — used in CSV import
  description  text,
  is_system    boolean not null default false,   -- the "ALL" group is system-managed
  status       text not null default 'active' check (status in ('active', 'archived')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (company_id, code)
);
create index if not exists idx_employee_groups_company on public.employee_groups(company_id);
create index if not exists idx_employee_groups_status  on public.employee_groups(status);

alter table public.employee_groups enable row level security;

-- SELECT policy: CF admins see all; company members see their company's groups.
drop policy if exists read_employee_groups on public.employee_groups;
create policy read_employee_groups on public.employee_groups
  for select to authenticated
  using (
    public.is_cf_admin()
    or company_id = public.current_company_id()
    or company_id = (select company_id from public.employees where id = public.current_employee_id())
  );

-- updated_at trigger
drop trigger if exists set_updated_at on public.employee_groups;
create trigger set_updated_at before update on public.employee_groups
  for each row execute function public.tg_set_updated_at();

-- ---------- 2. employees.group_id FK ------------------------------------

alter table public.employees
  add column if not exists group_id uuid references public.employee_groups(id) on delete set null;

create index if not exists idx_employees_group on public.employees(group_id);

-- ---------- 3. benefit_assignments: group_label → group_id FK -----------
--
-- The existing column `group_label text` was a stringly-typed placeholder.
-- Since benefit_assignments has 0 rows, we can drop it and re-add as FK.

alter table public.benefit_assignments
  drop constraint if exists benefit_assignments_check;   -- the either-or check
alter table public.benefit_assignments
  drop column if exists group_label;
alter table public.benefit_assignments
  add column if not exists group_id uuid references public.employee_groups(id) on delete cascade;

create index if not exists idx_assignments_group on public.benefit_assignments(group_id);

-- Re-add the either-or check: must target either an employee OR a group (not both null).
alter table public.benefit_assignments
  add constraint benefit_assignments_target_check
  check (employee_id is not null or group_id is not null);

-- ---------- 4. vendors: discount model + tags ---------------------------

do $$ begin
  create type discount_target as enum ('benefit_price', 'final_price');
exception when duplicate_object then null; end $$;

alter table public.vendors
  add column if not exists discount_percentage numeric(5,2) not null default 0
    check (discount_percentage >= 0 and discount_percentage <= 100),
  add column if not exists discount_applies_to discount_target not null default 'final_price',
  add column if not exists tags text[] not null default '{}';

-- GIN index for efficient tag filtering (e.g. "all vendors tagged vegan").
create index if not exists idx_vendors_tags on public.vendors using gin (tags);

-- ---------- 5. orders: GonnaOrder sync fields ---------------------------
--
-- External ids (uuid + token) come from the GonnaOrder payload. `voucher_code`
-- mirrors the minted voucher on the order so we can reconcile against
-- benefit_topups.gonnaorder_voucher_code.

alter table public.orders
  add column if not exists external_uuid text,
  add column if not exists order_token   text,
  add column if not exists voucher_code  text;

-- Secondary unique index on external_uuid (nullable — not all sources have one).
create unique index if not exists uq_orders_external_uuid
  on public.orders (external_uuid)
  where external_uuid is not null;

create index if not exists idx_orders_voucher_code on public.orders(voucher_code);

-- ---------- 6. my_benefits view: include group assignments --------------
--
-- The old view only checked direct employee_id assignments. Now an employee
-- can also receive a benefit via their group, so we union both paths.

create or replace view public.my_benefits
  with (security_invoker = off) as
  with me as (
    select id, company_id, group_id from public.employees where id = public.current_employee_id()
  ),
  my_assignments as (
    select ba.*
      from public.benefit_assignments ba, me
     where ba.unassigned_at is null
       and (
         ba.employee_id = me.id
         or (ba.group_id is not null and ba.group_id = me.group_id)
       )
  )
  select
    b.id as benefit_id,
    b.company_id,
    b.name_el,
    b.name_en,
    b.type,
    b.credit_amount,
    b.currency,
    b.status as benefit_status,
    ma.id as assignment_id,
    ma.gonnaorder_voucher_code,
    bl.cycle_start,
    bl.cycle_end,
    coalesce(bl.granted_amount, 0) as granted_amount,
    coalesce(bl.redeemed_amount, 0) as redeemed_amount,
    coalesce(bl.granted_amount, 0) - coalesce(bl.redeemed_amount, 0) as remaining_amount
  from public.benefits b
  join my_assignments ma on ma.benefit_id = b.id
  left join public.benefit_ledger bl
    on bl.benefit_id = b.id
   and bl.employee_id = (select id from me)
  where b.status = 'active';

grant select on public.my_benefits to authenticated;
