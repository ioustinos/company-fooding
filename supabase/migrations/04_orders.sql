-- Migration 04 — orders mirror (E2.4)
--
-- CF mirrors the subset of GonnaOrder order data it needs for reporting
-- and invoicing. `(source, external_order_id)` is the dedup key for the
-- webhook (GonnaOrder retries are idempotent).

create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  source              order_source not null default 'gonnaorder',
  external_order_id   text not null,
  employee_id         uuid references public.employees(id) on delete set null,
  company_id          uuid references public.companies(id) on delete set null,
  vendor_id           uuid references public.vendors(id)   on delete set null,
  agreement_id        uuid references public.matchmaking_agreements(id) on delete set null,
  office_id           uuid references public.company_offices(id)        on delete set null,
  subtotal            int not null default 0 check (subtotal >= 0),        -- cents
  benefit_applied     int not null default 0 check (benefit_applied >= 0), -- cents
  topup_amount        int not null default 0 check (topup_amount >= 0),    -- cents (non-benefit amount paid by employee)
  total               int not null default 0 check (total >= 0),
  delivery_date       date,
  time_from           time,
  time_to             time,
  status              order_status_mirror not null default 'pending',
  placed_at           timestamptz not null default now(),
  raw_payload         jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (source, external_order_id)
);
create index if not exists idx_orders_employee    on public.orders(employee_id);
create index if not exists idx_orders_company     on public.orders(company_id);
create index if not exists idx_orders_vendor      on public.orders(vendor_id);
create index if not exists idx_orders_delivery    on public.orders(delivery_date);
create index if not exists idx_orders_placed_at   on public.orders(placed_at);

create table if not exists public.order_items (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  external_item_id    text,
  name_el             text,
  name_en             text,
  variant_label_el    text,
  variant_label_en    text,
  quantity            int not null default 1 check (quantity > 0),
  unit_price          int not null default 0 check (unit_price >= 0),   -- cents
  total_price         int not null default 0 check (total_price >= 0),  -- cents
  tags                text[] not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_order_items_order on public.order_items(order_id);

-- order_benefit_uses — source of truth for which benefit covered how much
-- of an order. Mirrors Fitpal's voucher_uses pattern.
create table if not exists public.order_benefit_uses (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id)   on delete cascade,
  benefit_id          uuid not null references public.benefits(id) on delete restrict,
  amount              int not null check (amount >= 0),       -- cents applied
  rule_version_hash   text,                                   -- hash of benefit_rules at time of use
  created_at          timestamptz not null default now()
);
create index if not exists idx_order_benefit_uses_order   on public.order_benefit_uses(order_id);
create index if not exists idx_order_benefit_uses_benefit on public.order_benefit_uses(benefit_id);

alter table public.orders              enable row level security;
alter table public.order_items         enable row level security;
alter table public.order_benefit_uses  enable row level security;
