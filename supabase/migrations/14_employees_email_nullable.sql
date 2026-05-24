-- Migration 14 — employees.email nullable + voucher-code uniqueness
--
-- Motivated by the 2026-05-15 first-customer onboarding (Queensway):
-- 21 of 63 employees have no email yet. The voucher code (external_ref)
-- is the primary identifier in this org, not the email — the email is
-- only required at invite-to-login time.
--
-- Two changes:
--   1. employees.email becomes nullable.
--      The existing UNIQUE (company_id, email) constraint stays — Postgres
--      treats NULL != NULL in unique constraints, so multiple null-email
--      rows in the same company are allowed.
--   2. Add a partial unique index on (company_id, lower(external_ref))
--      so voucher codes are guaranteed unique within a company. Case-insensitive
--      to match the GonnaOrder reconciliation logic (Base44 sync code does
--      lower() on both sides at compare time).

alter table public.employees
  alter column email drop not null;

create unique index if not exists uq_employees_company_external_ref
  on public.employees (company_id, lower(external_ref))
  where external_ref is not null;
