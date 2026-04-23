-- Migration 05 — invoices (E2.5)
--
-- Vendors invoice companies directly; CF mirrors those invoices for
-- reporting and disputes. CF is NOT merchant-of-record.

create table if not exists public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  vendor_id          uuid not null references public.vendors(id)   on delete restrict,
  company_id         uuid not null references public.companies(id) on delete restrict,
  period_start       date not null,
  period_end         date not null,
  external_ref       text,                       -- vendor's own invoice number
  total_amount       int not null default 0 check (total_amount >= 0),   -- cents
  currency           text not null default 'EUR',
  status             invoice_status not null default 'issued',
  issued_at          timestamptz,
  received_at        timestamptz,
  paid_at            timestamptz,
  disputed_reason    text,
  pdf_url            text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (period_end >= period_start)
);
create index if not exists idx_invoices_company on public.invoices(company_id);
create index if not exists idx_invoices_vendor  on public.invoices(vendor_id);
create index if not exists idx_invoices_status  on public.invoices(status);
create index if not exists idx_invoices_period  on public.invoices(period_start, period_end);

create table if not exists public.invoice_line_items (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references public.invoices(id) on delete cascade,
  description_el    text,
  description_en    text,
  order_id          uuid references public.orders(id)    on delete set null,
  benefit_id        uuid references public.benefits(id)  on delete set null,
  amount            int not null default 0 check (amount >= 0),  -- cents
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_invoice_lines_invoice on public.invoice_line_items(invoice_id);

alter table public.invoices            enable row level security;
alter table public.invoice_line_items  enable row level security;
