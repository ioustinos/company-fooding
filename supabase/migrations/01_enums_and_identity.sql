-- Migration 01 — enums + core identity (E2.1)
--
-- Creates:
--   Enums: cf_role, company_role, benefit_type, benefit_status,
--          agreement_status, invoice_status, order_source,
--          order_status_mirror, sticker_mode
--   Tables: cf_admins, companies, company_offices, company_users,
--           employees, vendors
--
-- Idempotent — safe to re-run.

-- Requires pgcrypto for gen_random_uuid(). Supabase has it enabled by default;
-- the `if not exists` keeps re-runs safe.
create extension if not exists "pgcrypto";

-- ------------------------------ Enums -----------------------------------

do $$ begin
  create type cf_role as enum ('cf_owner', 'cf_operator');
exception when duplicate_object then null; end $$;

do $$ begin
  create type company_role as enum ('company_admin', 'company_viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type benefit_type as enum ('monthly_allowance', 'weekly_credit', 'one_time');
exception when duplicate_object then null; end $$;

do $$ begin
  create type benefit_status as enum ('active', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type agreement_status as enum ('active', 'paused', 'ended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type invoice_status as enum ('issued', 'received', 'paid', 'disputed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_source as enum ('gonnaorder');  -- future: 'direct'
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status_mirror as enum (
    'pending', 'confirmed', 'preparing', 'delivering', 'delivered', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type sticker_mode as enum ('employee_name', 'anonymized');
exception when duplicate_object then null; end $$;

-- ------------------------------ Tables ----------------------------------

-- CF operators (platform staff). Seeded manually after first signup.
create table if not exists public.cf_admins (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        cf_role not null default 'cf_operator',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.companies (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  vat_number     text,
  billing_email  text,
  status         text not null default 'active' check (status in ('active', 'suspended')),
  settings       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.company_offices (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  label_el     text not null,
  label_en     text not null,
  street       text,
  area         text,
  zip          text,
  lat          numeric(10, 7),
  lng          numeric(10, 7),
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_company_offices_company on public.company_offices(company_id);

create table if not exists public.company_users (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  company_id  uuid not null references public.companies(id) on delete cascade,
  role        company_role not null default 'company_admin',
  status      text not null default 'invited' check (status in ('active', 'invited', 'suspended')),
  email       text,  -- for invite flow before user_id exists
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, company_id)
);
create index if not exists idx_company_users_company on public.company_users(company_id);

create table if not exists public.employees (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete set null,
  company_id          uuid not null references public.companies(id) on delete cascade,
  external_ref        text,                     -- payroll id, nullable
  display_name        text not null,
  email               text not null,
  default_office_id   uuid references public.company_offices(id) on delete set null,
  status              text not null default 'active' check (status in ('active', 'inactive')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (company_id, email)
);
create index if not exists idx_employees_company on public.employees(company_id);
create index if not exists idx_employees_user on public.employees(user_id);

create table if not exists public.vendors (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  legal_name             text,
  vat_number             text,
  contact_email          text,
  gonnaorder_merchant_id text not null,
  status                 text not null default 'active' check (status in ('active', 'suspended')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (gonnaorder_merchant_id)
);

-- RLS — turn on here; policies are installed in migration 07.
alter table public.cf_admins        enable row level security;
alter table public.companies        enable row level security;
alter table public.company_offices  enable row level security;
alter table public.company_users    enable row level security;
alter table public.employees        enable row level security;
alter table public.vendors          enable row level security;
