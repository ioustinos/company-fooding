-- Migration 12 — drop benefits.type + benefit_type enum
--
-- Rationale: `benefits.type` ('monthly_allowance' | 'weekly_credit' | 'one_time')
-- duplicated information already carried by benefit_rules.topup_cadence +
-- benefit_rules.carryover. Keeping both forced two places to stay in sync
-- and confused the benefit editor UI. We derive the human label in the app
-- layer from cadence + carryover (+ amount).
--
-- Safe on empty tables. `my_benefits` view must be recreated because it
-- currently SELECTs b.type.

-- 1. Drop & recreate my_benefits view (can't replace a view that drops cols)
drop view if exists public.my_benefits;

alter table public.benefits drop column if exists type;
drop type if exists benefit_type;

create view public.my_benefits
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
