-- 16_benefit_rules_anchor.sql
--
-- Adds the top-up *anchor* to benefit_rules: the exact moment a cadence fires.
-- The benefit edit form (page_co_benefit_edit) captures these today, but they
-- are not persisted until this migration is applied. The scheduler
-- (CF_TOPUPS_DRY_RUN) consumes them once live.
--
--   topup_dom      day-of-month (1..31) for cadence='monthly'
--   topup_dom_eom  true → "last day of month" (overrides topup_dom)
--   topup_dow      day-of-week (1=Mon .. 7=Sun) for cadence='weekly'
--   topup_time     time-of-day (Europe/Athens) the top-up fires
--
-- All nullable — existing rows keep firing at the scheduler's default time.
--
-- ⚠️  NOT YET APPLIED. Per the project's "Show Before Execute" rule, this needs
--     Ioustinos's explicit approval before running against Supabase. Once
--     approved + applied, wire the anchor fields into cf-benefits.ts
--     (POST/PUT) and the form's save payload.

alter table public.benefit_rules
  add column if not exists topup_dom     smallint check (topup_dom between 1 and 31),
  add column if not exists topup_dom_eom boolean not null default false,
  add column if not exists topup_dow     smallint check (topup_dow between 1 and 7),
  add column if not exists topup_time    time;

comment on column public.benefit_rules.topup_dom     is 'Day of month (1..31) the monthly top-up fires';
comment on column public.benefit_rules.topup_dom_eom is 'If true, monthly top-up fires on the last day of the month (overrides topup_dom)';
comment on column public.benefit_rules.topup_dow     is 'Day of week (1=Mon..7=Sun) the weekly top-up fires';
comment on column public.benefit_rules.topup_time    is 'Time-of-day (Europe/Athens) the top-up fires';
