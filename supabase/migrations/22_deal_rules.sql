-- 22: Deal rules — the money terms of a deal (company × vendor agreement),
-- stored as dated, typed rows that super admins edit. Code knows what each
-- rule KIND means; every value lives here. Reporting/billing only — the
-- ordering site (GonnaOrder) is kept in sync by hand.
--
-- Kinds:
--   catalogue_discount        vendor-funded discount on listing prices (% or €), optionally by tag.
--                             Today: reporting. Future: pushed to the integrated ordering system.
--   order_discount            vendor-funded discount on the order to employees (% or €), optional min order.
--   benefit_invoice_discount  vendor discount on the benefit invoiced to the company
--                             (% of benefit, or € per order / per benefit day).
--   minimum_commitment        company pays at least X per day/week/month:
--                             fixed € or N orders × that day's benefit; which days count is configurable.
--                             Invoice per period = max(minimum, benefit − benefit_invoice_discount).
--   loyalty                   vendor-funded: every spend_cents spent earns earn_cents; consumed AFTER the benefit.

create type deal_rule_kind as enum
  ('catalogue_discount', 'order_discount', 'benefit_invoice_discount', 'minimum_commitment', 'loyalty');
create type deal_rule_amount_unit as enum ('per_order', 'per_benefit_day');
create type deal_rule_period as enum ('day', 'week', 'month');
create type deal_rule_min_basis as enum ('fixed_amount', 'orders_x_benefit');
create type deal_rule_counts_on as enum
  ('days_with_orders', 'company_calendar', 'company_calendar_plus_order_days');

create table public.deal_rules (
  id              uuid primary key default gen_random_uuid(),
  agreement_id    uuid not null references public.matchmaking_agreements(id) on delete cascade,
  kind            deal_rule_kind not null,
  valid_from      date not null,
  valid_to        date,
  -- discount value: exactly one of these for discount kinds
  percent         numeric(5,2) check (percent is null or (percent > 0 and percent <= 100)),
  amount_cents    integer      check (amount_cents is null or amount_cents >= 0),
  -- catalogue_discount
  scope_tags      text[] not null default '{}',
  -- order_discount
  min_order_cents integer check (min_order_cents is null or min_order_cents >= 0),
  -- benefit_invoice_discount (€ form)
  amount_unit     deal_rule_amount_unit,
  -- minimum_commitment
  period          deal_rule_period,
  min_basis       deal_rule_min_basis,
  min_orders      integer check (min_orders is null or min_orders > 0),
  counts_on       deal_rule_counts_on,
  -- loyalty
  spend_cents     integer check (spend_cents is null or spend_cents > 0),
  earn_cents      integer check (earn_cents is null or earn_cents > 0),
  notes           text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint deal_rules_dates check (valid_to is null or valid_to >= valid_from),

  constraint deal_rules_discount_value check (
    kind not in ('catalogue_discount', 'order_discount', 'benefit_invoice_discount')
    or ((percent is not null) <> (amount_cents is not null))
  ),
  constraint deal_rules_invoice_unit check (
    kind <> 'benefit_invoice_discount' or amount_cents is null or amount_unit is not null
  ),
  constraint deal_rules_minimum check (
    kind <> 'minimum_commitment' or (
      period is not null and counts_on is not null and percent is null and (
        (min_basis = 'fixed_amount'     and amount_cents is not null and min_orders is null) or
        (min_basis = 'orders_x_benefit' and min_orders   is not null and amount_cents is null)
      )
    )
  ),
  constraint deal_rules_loyalty check (
    kind <> 'loyalty' or (spend_cents is not null and earn_cents is not null and percent is null and amount_cents is null)
  ),
  -- fields that only belong to one kind stay empty elsewhere
  constraint deal_rules_field_scope check (
    (kind = 'catalogue_discount' or scope_tags = '{}') and
    (kind = 'order_discount' or min_order_cents is null) and
    (kind = 'benefit_invoice_discount' or amount_unit is null) and
    (kind = 'minimum_commitment' or (period is null and min_basis is null and min_orders is null and counts_on is null)) and
    (kind = 'loyalty' or (spend_cents is null and earn_cents is null))
  )
);

create index deal_rules_agreement_idx on public.deal_rules (agreement_id, kind, valid_from);

comment on table public.deal_rules is
  'Dated money terms of a deal (company × vendor agreement). Editable by super admins; read by billing/reporting.';

-- Company working calendar, used by minimum_commitment.counts_on = company_calendar*.
create table public.company_calendar (
  company_id  uuid not null references public.companies(id) on delete cascade,
  date        date not null,
  is_workday  boolean not null,
  label       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (company_id, date)
);

-- updated_at triggers (same helper the other tables use)
create trigger set_updated_at before update on public.deal_rules
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.company_calendar
  for each row execute function public.tg_set_updated_at();

-- Service-role only for now (RLS on, no policies), like migration 20's internal tables.
alter table public.deal_rules enable row level security;
alter table public.company_calendar enable row level security;
