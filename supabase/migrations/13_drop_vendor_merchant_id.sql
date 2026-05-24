-- Migration 13 — drop vendors.gonnaorder_merchant_id
--
-- Motivated by the 2026-05-15 architectural review:
-- GonnaOrder's primary entity for our use case is the "store"
-- (= vendor × company relationship), already modelled on
-- agreement_shops.gonnaorder_shop_id. The per-vendor merchant_id was a
-- Base44-era assumption that doesn't map to anything we actually call.
--
-- GonnaOrder DOES have a parent-store concept that owns child stores
-- (used for menu inheritance and cross-store queries). We're deferring
-- that until we need it. When added, it'll be a deliberate column
-- (e.g. `gonnaorder_parent_store_id`) — not the catch-all merchant_id.
--
-- Safe to drop: public.vendors has 0 rows.

alter table public.vendors
  drop column if exists gonnaorder_merchant_id;
