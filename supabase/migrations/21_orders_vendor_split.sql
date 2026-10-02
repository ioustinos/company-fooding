-- 21: split GO's single discount into who funds it.
--
-- GO reports one voucher/member-code discount per order (voucherDiscount) and
-- prices items after any vendor item discount. For companies whose agreement
-- says the excess over the daily benefit is the vendor's loyalty credit
-- (matchmaking_agreements.settings.billing.excess_over_cap = 'vendor_loyalty'),
-- the sync now stores:
--   benefit_applied = min(voucherDiscount, day's benefit cap)   ← billed to the company
--   vendor_loyalty  = voucherDiscount − benefit_applied          ← vendor-funded
--   vendor_discount = subtotal − voucherDiscount − topup_amount  ← vendor item discount (e.g. 15%)
-- so subtotal = vendor_discount + benefit_applied + vendor_loyalty + topup_amount.
-- Benefit is consumed first, loyalty only covers what is above the cap
-- (confirmed with Ioustinos 2026-10-02).

alter table public.orders
  add column if not exists vendor_discount integer not null default 0 check (vendor_discount >= 0),
  add column if not exists vendor_loyalty  integer not null default 0 check (vendor_loyalty >= 0);

comment on column public.orders.vendor_discount is 'Cents. Vendor-funded item discount (subtotal − voucher discount − amount paid).';
comment on column public.orders.vendor_loyalty  is 'Cents. Vendor-funded loyalty part of the GO voucher discount, above the daily benefit cap.';
