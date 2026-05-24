-- Migration 15 — agreement_shops uniqueness scoped per agreement
--
-- Motivated by the 2026-05-15 architectural review:
-- The same physical canteen (one GonnaOrder store) often serves multiple
-- legal entities that share an office but invoice separately. First case:
-- Queensway Group's three sister companies (Queensway Navigation, Paricom,
-- Vsltec) all eat at the same canteen, all served by GonnaOrder store 5677,
-- but Wecook bills each entity on a separate invoice.
--
-- Old constraint forced a 1:1 between GO stores and matchmaking_agreements
-- (and therefore between GO stores and CF companies via the agreement).
-- The new constraint allows the same shop to appear under multiple
-- agreements (one per CF company) but never twice under the same agreement.
--
-- Order ingestion routes by employee → company (the employee's company_id
-- determines the order's CF company), NOT by walking from store back to
-- agreement. Base44 already does it this way — we're just unblocking the
-- 1-store-many-companies case.

alter table public.agreement_shops
  drop constraint if exists agreement_shops_gonnaorder_shop_id_key;

create unique index if not exists uq_agreement_shops_agreement_shop
  on public.agreement_shops (agreement_id, gonnaorder_shop_id);
