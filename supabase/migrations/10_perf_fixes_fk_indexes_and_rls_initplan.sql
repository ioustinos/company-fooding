-- Migration 10 — perf advisor fixes
--
-- 1. Covering indexes on 7 foreign keys flagged by unindexed_foreign_keys.
-- 2. Two RLS policies rewritten to wrap auth.uid() in (select ...) per the
--    auth_rls_initplan guidance — Postgres can then plan-cache the call
--    instead of re-evaluating per row.

-- FK indexes
create index if not exists idx_agreement_offices_office on public.agreement_offices(office_id);
create index if not exists idx_benefit_topups_benefit   on public.benefit_topups(benefit_id);
create index if not exists idx_employees_default_office on public.employees(default_office_id);
create index if not exists idx_invoice_lines_benefit    on public.invoice_line_items(benefit_id);
create index if not exists idx_invoice_lines_order      on public.invoice_line_items(order_id);
create index if not exists idx_orders_agreement         on public.orders(agreement_id);
create index if not exists idx_orders_office            on public.orders(office_id);

-- RLS initplan fixes — wrap auth.uid() in (select ...)
drop policy if exists read_cf_admins on public.cf_admins;
create policy read_cf_admins on public.cf_admins
  for select to authenticated
  using (public.is_cf_admin() or user_id = (select auth.uid()));

drop policy if exists read_company_users on public.company_users;
create policy read_company_users on public.company_users
  for select to authenticated
  using (public.is_cf_admin()
         or company_id = public.current_company_id()
         or user_id = (select auth.uid()));
