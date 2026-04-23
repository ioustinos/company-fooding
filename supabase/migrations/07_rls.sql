-- Migration 07 — RLS helpers + SELECT policies + my_benefits view (E2.7)
--
-- CF uses service-role writes via Netlify Functions. RLS's job here is
-- narrowed to **tenant-scoped reads** only. No write policies are installed;
-- service-role bypasses RLS, and no authenticated role gets INSERT/UPDATE/
-- DELETE on these tables outside Functions.

-- ------------------------------ Helpers ---------------------------------

create or replace function public.is_cf_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.cf_admins where user_id = auth.uid());
$$;

create or replace function public.current_company_id()
returns uuid language sql stable security definer set search_path = public as $$
  select company_id
  from public.company_users
  where user_id = auth.uid() and status = 'active'
  limit 1;
$$;

create or replace function public.current_employee_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id
  from public.employees
  where user_id = auth.uid() and status = 'active'
  limit 1;
$$;

grant execute on function public.is_cf_admin()         to authenticated;
grant execute on function public.current_company_id()  to authenticated;
grant execute on function public.current_employee_id() to authenticated;

-- ------------------------------ Policies --------------------------------

-- Pattern: drop-then-create so migrations stay idempotent.

-- cf_admins: only CF admins can read.
drop policy if exists read_cf_admins on public.cf_admins;
create policy read_cf_admins on public.cf_admins
  for select to authenticated
  using (public.is_cf_admin() or user_id = auth.uid());

-- companies: CF admins see all; company members see their own.
drop policy if exists read_companies on public.companies;
create policy read_companies on public.companies
  for select to authenticated
  using (public.is_cf_admin() or id = public.current_company_id());

drop policy if exists read_company_offices on public.company_offices;
create policy read_company_offices on public.company_offices
  for select to authenticated
  using (public.is_cf_admin() or company_id = public.current_company_id());

drop policy if exists read_company_users on public.company_users;
create policy read_company_users on public.company_users
  for select to authenticated
  using (public.is_cf_admin()
         or company_id = public.current_company_id()
         or user_id = auth.uid());

-- employees: CF admin sees all; company sees its own; employee sees self.
drop policy if exists read_employees on public.employees;
create policy read_employees on public.employees
  for select to authenticated
  using (public.is_cf_admin()
         or company_id = public.current_company_id()
         or id = public.current_employee_id());

-- vendors: readable by all authenticated (needed for employees to see who they can order from).
drop policy if exists read_vendors on public.vendors;
create policy read_vendors on public.vendors
  for select to authenticated
  using (status = 'active' or public.is_cf_admin());

-- Matchmaking
drop policy if exists read_agreements on public.matchmaking_agreements;
create policy read_agreements on public.matchmaking_agreements
  for select to authenticated
  using (public.is_cf_admin()
         or company_id = public.current_company_id()
         -- employees of the company see their agreements so they can pick shops
         or company_id = (select company_id from public.employees
                          where id = public.current_employee_id()));

drop policy if exists read_agreement_offices on public.agreement_offices;
create policy read_agreement_offices on public.agreement_offices
  for select to authenticated
  using (
    public.is_cf_admin() or agreement_id in (
      select id from public.matchmaking_agreements
      where company_id = public.current_company_id()
         or company_id = (select company_id from public.employees
                          where id = public.current_employee_id())
    )
  );

drop policy if exists read_agreement_shops on public.agreement_shops;
create policy read_agreement_shops on public.agreement_shops
  for select to authenticated
  using (
    public.is_cf_admin() or agreement_id in (
      select id from public.matchmaking_agreements
      where company_id = public.current_company_id()
         or company_id = (select company_id from public.employees
                          where id = public.current_employee_id())
    )
  );

-- Benefits: company admins see their company; employees see via my_benefits view.
drop policy if exists read_benefits on public.benefits;
create policy read_benefits on public.benefits
  for select to authenticated
  using (public.is_cf_admin() or company_id = public.current_company_id());

drop policy if exists read_benefit_rules on public.benefit_rules;
create policy read_benefit_rules on public.benefit_rules
  for select to authenticated
  using (
    public.is_cf_admin() or benefit_id in (
      select id from public.benefits where company_id = public.current_company_id()
    )
  );

drop policy if exists read_benefit_assignments on public.benefit_assignments;
create policy read_benefit_assignments on public.benefit_assignments
  for select to authenticated
  using (
    public.is_cf_admin()
    or employee_id = public.current_employee_id()
    or benefit_id in (select id from public.benefits where company_id = public.current_company_id())
  );

drop policy if exists read_benefit_ledger on public.benefit_ledger;
create policy read_benefit_ledger on public.benefit_ledger
  for select to authenticated
  using (
    public.is_cf_admin()
    or employee_id = public.current_employee_id()
    or benefit_id in (select id from public.benefits where company_id = public.current_company_id())
  );

drop policy if exists read_benefit_topups on public.benefit_topups;
create policy read_benefit_topups on public.benefit_topups
  for select to authenticated
  using (
    public.is_cf_admin()
    or employee_id = public.current_employee_id()
    or benefit_id in (select id from public.benefits where company_id = public.current_company_id())
  );

-- Orders & items
drop policy if exists read_orders on public.orders;
create policy read_orders on public.orders
  for select to authenticated
  using (
    public.is_cf_admin()
    or company_id = public.current_company_id()
    or employee_id = public.current_employee_id()
  );

drop policy if exists read_order_items on public.order_items;
create policy read_order_items on public.order_items
  for select to authenticated
  using (
    public.is_cf_admin() or order_id in (
      select id from public.orders
      where company_id = public.current_company_id()
         or employee_id = public.current_employee_id()
    )
  );

drop policy if exists read_order_benefit_uses on public.order_benefit_uses;
create policy read_order_benefit_uses on public.order_benefit_uses
  for select to authenticated
  using (
    public.is_cf_admin() or order_id in (
      select id from public.orders
      where company_id = public.current_company_id()
         or employee_id = public.current_employee_id()
    )
  );

-- Invoices & lines (CF + company; vendor portal is future)
drop policy if exists read_invoices on public.invoices;
create policy read_invoices on public.invoices
  for select to authenticated
  using (public.is_cf_admin() or company_id = public.current_company_id());

drop policy if exists read_invoice_line_items on public.invoice_line_items;
create policy read_invoice_line_items on public.invoice_line_items
  for select to authenticated
  using (
    public.is_cf_admin() or invoice_id in (
      select id from public.invoices where company_id = public.current_company_id()
    )
  );

-- Settings: public read (it's lookup-ish, no PII).
drop policy if exists read_settings on public.settings;
create policy read_settings on public.settings
  for select to authenticated using (true);

-- Audit log: CF admins only. (Company admins get a curated slice through a Function.)
drop policy if exists read_audit_log on public.audit_log;
create policy read_audit_log on public.audit_log
  for select to authenticated
  using (public.is_cf_admin());

-- ------------------------------ Views -----------------------------------

-- my_benefits — the safe surface that powers EmployeeHome.
-- Runs with definer rights so employees can read their own ledger row
-- without opening benefit_ledger to cross-tenant reads.
create or replace view public.my_benefits
  with (security_invoker = off) as
  select
    b.id as benefit_id,
    b.company_id,
    b.name_el,
    b.name_en,
    b.type,
    b.credit_amount,
    b.currency,
    b.status as benefit_status,
    ba.id as assignment_id,
    ba.gonnaorder_voucher_code,
    bl.cycle_start,
    bl.cycle_end,
    coalesce(bl.granted_amount, 0) as granted_amount,
    coalesce(bl.redeemed_amount, 0) as redeemed_amount,
    coalesce(bl.granted_amount, 0) - coalesce(bl.redeemed_amount, 0) as remaining_amount
  from public.benefits b
  join public.benefit_assignments ba on ba.benefit_id = b.id
  left join public.benefit_ledger bl on bl.benefit_id = b.id and bl.employee_id = ba.employee_id
  where ba.employee_id = public.current_employee_id()
    and ba.unassigned_at is null
    and b.status = 'active';

grant select on public.my_benefits to authenticated;
