-- 19_benefit_voucher_type.sql
--
-- Per-benefit voucher style on benefit_rules. Two models supported:
--
--   voucher_discount_type='absolute'   → fixed EUR cents per cycle (initialValue
--                                        + discount = topup_amount/100 EUR,
--                                        GO discountType='ABSOLUTE')
--   voucher_discount_type='percentile' → % off per order, no per-cycle cap
--                                        (GO discountType='PERCENTILE',
--                                         discount = voucher_discount_pct)
--
-- 'absolute' is the CF-native model. 'percentile' exists for back-compat with
-- stores set up that way (Queensway: existing GO vouchers are 5% MULTI_USE and
-- we don't want to recreate them).
--
-- Applied to Supabase on 2026-05-26 via MCP apply_migration. Queensway's seed
-- benefit was updated to percentile/5 by this migration.

alter table public.benefit_rules
  add column if not exists voucher_discount_type text not null default 'absolute'
    check (voucher_discount_type in ('absolute','percentile')),
  add column if not exists voucher_discount_pct  smallint
    check (voucher_discount_pct is null or (voucher_discount_pct between 1 and 100));

update public.benefit_rules br
   set voucher_discount_type = 'percentile',
       voucher_discount_pct  = 5
  from public.benefits b
  join public.companies c on c.id = b.company_id
 where br.benefit_id = b.id
   and c.name = 'Queensway Navigation';

comment on column public.benefit_rules.voucher_discount_type is
  'absolute → fixed-cents balance voucher; percentile → percent-off voucher (legacy / Queensway compat)';
comment on column public.benefit_rules.voucher_discount_pct is
  'Percentage discount, used only when voucher_discount_type=percentile (e.g. 5 = 5%).';
