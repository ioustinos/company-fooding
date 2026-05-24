# Company Fooding (CF) — Technical Specification

> **Working name:** Company Fooding (CF). All references below — code, Linear, GitHub, Supabase — use the `CF` / `cf` prefix until renamed.
> **Date:** 2026-04-23
> **Status:** Draft v0.1 — to be reviewed by Ioustinos before execution.
> **Supersedes:** the freeform overview shared on 2026-04-23.

---

## 1. Overview

Company Fooding (CF) is a **B2B marketplace and operations platform** that sits between three stakeholders:

- **Companies** — typically HR / facility managers who fund and administer food benefits for their employees.
- **Employees** — eat, top up out of pocket when their benefit doesn't cover the full order.
- **Vendors** — restaurants, caterers, and street-food providers who cook and deliver.

CF's job is to (a) match companies with vendors, (b) turn corporate food budgets into flexible per-employee vouchers, (c) consolidate the resulting order flow, and (d) make month-end invoicing and ESG reporting painless.

The ordering experience itself — menu browsing, cart, checkout, payment, kitchen tickets — is **powered by GonnaOrder**, a third-party multi-vendor ordering platform that CF controls via API but does not own. CF layers benefit management, matchmaking, and reporting on top of GonnaOrder.

**CF is NOT a merchant-of-record.** Vendors invoice companies directly. Employee top-ups are card payments made to the vendor via GonnaOrder; CF captures metadata (amount, benefit applied) for reporting, but no money flows through CF's bank account.

### Value proposition in one line

> "One tab for HR to configure benefits, one app for employees to spend them, one stack of invoices at month-end — across any vendor you want."

---

## 2. System Architecture

CF consists of four user-facing surfaces and a shared backend.

### 2.1 Surfaces

| Surface                  | Audience                | Hosting                               | Status in MVP v1                   |
| ------------------------ | ----------------------- | ------------------------------------- | ---------------------------------- |
| **Super Admin Panel**    | CF operators            | `app.companyfooding.com/admin`        | In scope                           |
| **Company Admin Panel**  | Company HR / facility   | `app.companyfooding.com/company`      | In scope                           |
| **Employee Portal**      | Employees               | `app.companyfooding.com/` (thin SPA)  | In scope (thin shell → GonnaOrder) |
| **Vendor Admin**         | Vendor merchants        | GonnaOrder's native merchant UI       | Deferred; use GonnaOrder for v1    |

All four are served from the same Netlify site, routed by React Router 7. Auth and role resolution happen on Supabase and are surfaced as `isCfAdmin`, `companyId`, `vendorId` on the user object.

### 2.2 Backend

- **Supabase Postgres** — canonical data store for companies, employees, vendors, matchmaking, benefits, redemptions, invoices, and the CF-side mirror of GonnaOrder orders.
- **Supabase Auth** — single auth domain for all three user types (role disambiguates). Email + password at launch; magic link and SMS in later phases.
- **Netlify Functions** (`netlify/functions/*.ts`) — every write endpoint. Functions authenticate the caller via the Supabase JWT, authorize against the user's role / tenant, then mutate using the **Supabase service-role key**. The browser never holds the service-role key.
- **Supabase RLS** — still enabled on every table. Purpose: **tenant read isolation**. A company admin reading `orders` via the client sees only their company's rows; a vendor sees only their vendor's rows.

### 2.3 External systems

- **GonnaOrder** — ordering engine. CF calls GonnaOrder's API to provision shops, read menus, issue vouchers, and ingest orders via webhook.
- **Email provider** (e.g. Resend) — transactional email (invitations, invoice notifications, monthly digests).
- **Viva Payments** — not integrated in v1. All card payments happen inside GonnaOrder's own checkout.

### 2.4 High-level diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Super Admin Panel                         │
│ companies • vendors • matchmaking • benefit templates • audit    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────────┐
│                      Company Admin Panel                         │
│   benefits CRUD • employees • invoices • adoption & $ reports    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────────┐
│                        Employee Portal (thin)                    │
│  login • see my benefits • "order now" handoff → GonnaOrder shop │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Supabase (Postgres + Auth)                   │
│                  + Netlify Functions (service-role writes)       │
└───────┬─────────────────────────────────────────────────┬───────┘
        │                                                 │
        ▼                                                 ▼
┌─────────────────┐                               ┌──────────────┐
│   GonnaOrder    │◀─webhooks/orders──────────────│  CF reports  │
│  (menu + cart + │                               │  + invoices  │
│   checkout UI)  │─vouchers/shops API calls─────▶│              │
└─────────────────┘                               └──────────────┘
```

---

## 3. Stack

Mirrors Fitpal as of 2026-04-23 so the two codebases stay portable.

| Layer            | Choice                                                  |
| ---------------- | ------------------------------------------------------- |
| Frontend         | React 19.2 + TypeScript 6 + Vite 8                      |
| Routing          | React Router 7                                          |
| State            | Zustand 5 (per-domain stores)                           |
| Auth / DB        | Supabase (`@supabase/supabase-js` 2.x)                  |
| Server-side      | Netlify Functions (Node 20, TypeScript)                 |
| Drag-drop        | `@dnd-kit/*` (matchmaking reorder, benefit priority)    |
| Styling          | Single `index.css` at launch, Tailwind migration in backlog (same call as Fitpal made) |
| Bilingual        | `src/lib/translations.ts` with `t()` helper             |
| Email            | Resend via Netlify Function                             |
| Tests            | Vitest for unit + Playwright for e2e (setup in v1, coverage grows over time) |

Directory convention (mirrors Fitpal):

```
cf-platform/
  src/
    admin/               Super Admin app (lazy-loaded under /admin/*)
    company/             Company Admin app  (lazy-loaded under /company/*)
    components/
      layout/            Header, Sidebar, AuthModal, Footer
      ui/                Modal, Button, Table, Tabs, etc.
      benefits/          BenefitForm, BenefitCard, BenefitList
      matchmaking/       AgreementForm, AgreementCard
    lib/
      supabase.ts        anon-key client
      api/               typed wrappers around /netlify/functions + supabase reads
        cf.ts            Super Admin write wrappers
        company.ts       Company Admin write wrappers
        employee.ts      Employee-facing wrappers
        gonnaorder.ts    (in Functions only — re-exported for types)
      helpers.ts         money, date, formatters, guards
      translations.ts    EL / EN string maps
    store/
      useAuthStore.ts    session + role + tenant context
      useUIStore.ts      nav, modals, lang
      useBenefitsStore.ts(Company Admin — selected benefit, form state)
    pages/
      LoginPage.tsx      shared login gate
      EmployeeHome.tsx   thin "my benefits + order now" page
      NotFound.tsx
    AdminApp.tsx         Super Admin route tree
    CompanyApp.tsx       Company Admin route tree
    main.tsx
  netlify/
    functions/
      cf-*.ts            Super Admin write endpoints
      company-*.ts       Company Admin write endpoints
      employee-*.ts      Employee endpoints (e.g. "start order" handoff)
      gonnaorder-webhook.ts  receives GonnaOrder order events
      _shared/
        auth.ts          JWT + role resolution
        supabaseAdmin.ts service-role client factory
        gonnaorder.ts    GonnaOrder API client
        errors.ts        typed error envelope
  supabase/
    migrations/          numbered SQL files, Fitpal style
    schema_erd.html      generated ERD (like Fitpal)
  public/
    _redirects           SPA fallback (prod only)
  netlify.toml
  package.json
  tsconfig.json
  vite.config.ts
  CLAUDE.md              project context for future Claude sessions
```

---

## 4. Data Model

All tables live in `public` schema. Money is stored as **int cents**. Bilingual string columns use `_el` / `_en` suffixes. Every mutable table has `created_at` + `updated_at` (timestamptz) with triggers. UUID primary keys unless noted.

### 4.1 Enums

```sql
cf_role            ::= 'cf_owner' | 'cf_operator'
company_role       ::= 'company_admin' | 'company_viewer'
benefit_type       ::= 'monthly_allowance' | 'weekly_credit' | 'one_time'
topup_cadence      ::= 'daily' | 'weekly' | 'monthly' | 'one_time'
carryover_mode     ::= 'reset' | 'accumulate'
topup_status       ::= 'pending' | 'applied' | 'skipped' | 'failed'
benefit_status     ::= 'active' | 'archived'
agreement_status   ::= 'active' | 'paused' | 'ended'
invoice_status     ::= 'issued' | 'received' | 'paid' | 'disputed'
order_source       ::= 'gonnaorder'     -- future: 'direct'
order_status_mirror::= 'pending' | 'confirmed' | 'preparing' | 'delivering' | 'delivered' | 'cancelled'
sticker_mode       ::= 'employee_name' | 'anonymized'
```

### 4.2 Identity & tenancy

- **`cf_admins`** — `id`, `user_id` (→ `auth.users`), `role` (`cf_role`), created/updated. CF operators.
- **`companies`** — `id`, `name`, `vat_number`, `billing_email`, `status` ('active'|'suspended'), `settings` (jsonb), created/updated.
- **`company_offices`** — `id`, `company_id`, `label_el/_en`, `street`, `area`, `zip`, `lat`, `lng`, `is_default`, created/updated.
- **`company_users`** — `id`, `user_id` (→ `auth.users`), `company_id`, `role` (`company_role`), `status` ('active'|'invited'|'suspended'), created/updated.
- **`employees`** — `id`, `user_id` (→ `auth.users`, nullable until first login), `company_id`, `external_ref` (nullable, company-supplied e.g. payroll id), `display_name`, `email`, `default_office_id` (→ `company_offices`), `status` ('active'|'inactive'), created/updated.
- **`vendors`** — `id`, `name`, `legal_name`, `vat_number`, `contact_email`, `discount_percentage`, `discount_applies_to` ('benefit_price'|'final_price'), `tags` (text[]), `status` ('active'|'suspended'), created/updated. **No GonnaOrder identifier on the vendor** — a GO store represents a (vendor × company) relationship, so the GO store id lives on `agreement_shops.gonnaorder_shop_id`. GO's parent-store concept is deferred until we need menu inheritance / cross-store queries.

### 4.3 Matchmaking

- **`matchmaking_agreements`** — `id`, `company_id`, `vendor_id`, `status` (`agreement_status`), `sticker_mode` (`sticker_mode`), `reusable_containers` ('enforced'|'optional'|'disabled'), `start_date`, `end_date` (nullable), `notes`, created/updated.
- **`agreement_offices`** — `agreement_id`, `office_id`, `delivery_time_from` (time), `delivery_time_to` (time). Many offices per agreement; each row = one delivery window at one office.
- **`agreement_shops`** — `agreement_id`, `gonnaorder_shop_id` (unique across platform). Which GonnaOrder shop(s) surface under this agreement.

### 4.4 Benefits

- **`benefits`** — `id`, `company_id`, `name_el/_en`, `description_el/_en`, `type` (`benefit_type`), `credit_amount` (int cents), `currency` ('EUR'), `status` (`benefit_status`), `priority` (int; lower = applied first), `valid_from`, `valid_to` (nullable), created/updated.
- **`benefit_rules`** — `id`, `benefit_id`, `daily_cap` (int cents, nullable), `per_order_min` (int cents, nullable), `per_order_max` (int cents, nullable), `days_of_week` (int[] 1–7, nullable = all), `blackout_dates` (date[], default `{}`), `allowed_vendor_ids` (uuid[], nullable = all in company's agreements), `allowed_tags` (text[], nullable = all), `blocked_tags` (text[], nullable = none), **`topup_cadence`** (enum: `daily` | `weekly` | `monthly` | `one_time`), **`topup_amount`** (int cents — the amount added each tick), **`carryover`** (enum: `reset` | `accumulate` — what happens to unspent balance at each tick; default `reset`).
- **`benefit_assignments`** — `id`, `benefit_id`, `employee_id` (nullable), `group_label` (text, nullable — used when assigning to a named group), `assigned_at`, `unassigned_at` (nullable), **`gonnaorder_voucher_code`** (text, nullable — the voucher code that this assignment's top-ups target; minted once on first assignment, reused for life of the assignment).
- **`benefit_ledger`** — `id`, `benefit_id`, `employee_id`, `cycle_start` (date), `cycle_end` (date), `granted_amount` (int cents), `redeemed_amount` (int cents, default 0), `updated_at`. One row per employee per cycle; `granted_amount` is the *cumulative* amount added via top-ups in that cycle, `redeemed_amount` is maintained by the order webhook.
- **`benefit_topups`** — `id`, `assignment_id`, `benefit_id`, `employee_id`, `scheduled_for` (date), `amount` (int cents), `status` (enum: `pending` | `applied` | `skipped` | `failed`), `gonnaorder_voucher_code` (text), `applied_at` (timestamptz, nullable), `error_detail` (text, nullable), `created_at`, `updated_at`. One row per scheduled top-up tick. Unique on (`assignment_id`, `scheduled_for`) to guarantee idempotency when the scheduler retries.

### 4.5 Orders (CF mirror of GonnaOrder)

- **`orders`** — `id`, `source` (`order_source`), `external_order_id` (unique), `employee_id`, `company_id`, `vendor_id`, `agreement_id`, `office_id`, `subtotal` (int cents), `benefit_applied` (int cents), `topup_amount` (int cents), `total` (int cents), `delivery_date`, `time_from`, `time_to`, `status` (`order_status_mirror`), `placed_at`, `raw_payload` (jsonb — last-seen GonnaOrder payload for this order).
- **`order_items`** — `id`, `order_id`, `external_item_id`, `name_el/_en`, `variant_label_el/_en`, `quantity`, `unit_price` (int cents), `total_price` (int cents), `tags` (text[]).
- **`order_benefit_uses`** — `id`, `order_id`, `benefit_id`, `amount` (int cents), `rule_version_hash` (text — snapshot of the benefit_rules used). Source of truth for which benefit covered how much of an order. Mirrors Fitpal's `voucher_uses` pattern.

### 4.6 Invoicing

- **`invoices`** — `id`, `vendor_id`, `company_id`, `period_start` (date), `period_end` (date), `external_ref` (text — vendor's own invoice number), `total_amount` (int cents), `currency`, `status` (`invoice_status`), `issued_at`, `received_at`, `paid_at`, `disputed_reason`, `pdf_url`, created/updated.
- **`invoice_line_items`** — `id`, `invoice_id`, `description_el/_en`, `order_id` (nullable — for itemized line items), `benefit_id` (nullable), `amount` (int cents).

### 4.7 System

- **`settings`** — `key` (text PK), `value` (jsonb), `description`. Seeds:
  - `supported_langs`: `["el", "en"]`
  - `default_lang`: `"el"`
  - `min_order_cents`: `0` (per-agreement override lives on `matchmaking_agreements.settings` jsonb)
  - `invoice_grace_days`: `14`
- **`audit_log`** — `id`, `actor_user_id`, `actor_role` (text), `action` (text), `entity_table` (text), `entity_id` (uuid), `before` (jsonb), `after` (jsonb), `created_at`. Append-only. All Netlify Functions write one row on successful mutation.

### 4.8 Conventions

- All money in **cents** (int).
- All timestamps in `timestamptz`.
- Bilingual: `_el` / `_en` pair.
- Enums for constrained string sets (mirrors Fitpal).
- UUIDs everywhere (dropping Fitpal's `text` IDs for menu entities; we don't control the menu here — GonnaOrder does).
- `updated_at` maintained by a generic trigger function (copy from Fitpal migration).

---

## 5. Auth & Security

### 5.1 Auth

Supabase Auth owns `auth.users`. On signup:

- **Company Admin:** invited by a CF operator (Super Admin action). Invite email → signup → row in `company_users` auto-created via a post-signup trigger that matches the invite.
- **Employee:** company uploads roster (CSV or API); rows inserted into `employees` with `user_id = null`. First login via email magic link (later) or email+password (v1) resolves `user_id` and activates the employee.
- **CF operator:** seeded manually (same pattern as Fitpal's `public.admin_users` owner seeding one-liner).

### 5.2 Authorization model

Every Netlify Function does:

1. Read the caller's `Authorization: Bearer <supabase_jwt>` header.
2. Resolve role via `_shared/auth.ts`: `resolveActor(jwt) → { userId, cfRole?, companyId?, companyRole?, employeeId? }`.
3. Check that the requested mutation is permitted for that role on that tenant.
4. Execute the mutation using the service-role Supabase client.
5. Write one `audit_log` row.

### 5.3 RLS (reads only)

Because writes go through Functions, RLS's job is narrowed to **tenant-scoped reads**. Policies follow a small set of helpers:

```sql
-- installed once
create function public.is_cf_admin() returns boolean language sql stable security definer as $$
  select exists(select 1 from public.cf_admins where user_id = auth.uid());
$$;

create function public.current_company_id() returns uuid language sql stable security definer as $$
  select company_id from public.company_users where user_id = auth.uid() and status = 'active' limit 1;
$$;

create function public.current_employee_id() returns uuid language sql stable security definer as $$
  select id from public.employees where user_id = auth.uid() and status = 'active' limit 1;
$$;
```

Per-table read policies (examples):

- `companies`: `is_cf_admin()` OR `id = current_company_id()`.
- `employees`: `is_cf_admin()` OR `company_id = current_company_id()` OR `id = current_employee_id()`.
- `orders`: `is_cf_admin()` OR `company_id = current_company_id()` OR `employee_id = current_employee_id()` OR `vendor_id in (select vendor_id from vendor_users where user_id = auth.uid())` (vendor auth comes later; stub for now).
- `benefits`: `is_cf_admin()` OR `company_id = current_company_id()` OR (employee reads only their own via a view, see 5.4).

### 5.4 Employee-facing benefit view

Employees need to see their own assigned benefits and current balances without seeing siblings'. Implemented as a secure view:

```sql
create view public.my_benefits as
  select b.*, bl.granted_amount, bl.redeemed_amount,
         (bl.granted_amount - bl.redeemed_amount) as remaining_amount,
         bl.cycle_start, bl.cycle_end
  from public.benefits b
  join public.benefit_assignments ba on ba.benefit_id = b.id
  left join public.benefit_ledger bl on bl.benefit_id = b.id and bl.employee_id = ba.employee_id
  where ba.employee_id = public.current_employee_id()
    and ba.unassigned_at is null
    and b.status = 'active';
```

### 5.5 Secrets

| Secret                       | Lives in                             | Access              |
| ---------------------------- | ------------------------------------ | ------------------- |
| `SUPABASE_ANON_KEY`          | Vite env (client-exposed)            | browser + functions |
| `SUPABASE_SERVICE_ROLE_KEY`  | Netlify env var                      | functions only      |
| `GONNAORDER_API_KEY`         | Netlify env var                      | functions only      |
| `GONNAORDER_WEBHOOK_SECRET`  | Netlify env var                      | functions only      |
| `RESEND_API_KEY`             | Netlify env var                      | functions only      |

---

## 6. API Surface

### 6.1 Super Admin endpoints (`/.netlify/functions/cf-*`)

| Endpoint                          | Purpose                                    |
| --------------------------------- | ------------------------------------------ |
| `cf-create-company`               | Create a company + first admin invite      |
| `cf-update-company`               | Edit company details                       |
| `cf-create-vendor`                | Onboard a vendor (name, legal/VAT, discount, tags) |
| `cf-update-vendor`                | Edit vendor details                        |
| `cf-create-agreement`             | Create matchmaking agreement + shop links  |
| `cf-update-agreement`             | Edit / pause / end agreement               |
| `cf-invite-company-admin`         | Send an invite email with signup link      |
| `cf-list-audit`                   | Paginated audit log (admin-only read)      |

### 6.2 Company Admin endpoints (`/.netlify/functions/company-*`)

| Endpoint                          | Purpose                                    |
| --------------------------------- | ------------------------------------------ |
| `company-create-benefit`          | Create a benefit with rules                |
| `company-update-benefit`          | Edit a benefit                             |
| `company-archive-benefit`         | Archive (status → archived)                |
| `company-assign-benefit`          | Bulk assign benefit to employees/groups    |
| `company-import-employees`        | CSV upload → employees rows                |
| `company-update-employee`         | Edit employee                              |
| `company-mark-invoice-paid`       | Update invoice.status                      |
| `company-dispute-invoice`         | Update invoice.status + reason             |
| `company-export-report`           | Trigger CSV export, return signed URL      |

### 6.3 Employee endpoints (`/.netlify/functions/employee-*`)

| Endpoint                          | Purpose                                    |
| --------------------------------- | ------------------------------------------ |
| `employee-start-order`            | Returns a signed redirect URL to the appropriate GonnaOrder shop with a one-time voucher code minted for this employee's active benefits |

### 6.4 Scheduled Functions (`/.netlify/functions/cf-run-*`, Netlify Scheduled)

| Endpoint                          | Schedule (Europe/Athens)   | Purpose                                      |
| --------------------------------- | -------------------------- | -------------------------------------------- |
| `cf-run-benefit-topups`           | 05:00, 08:00, 12:00 daily  | First pass + two retries over `benefit_topups` rows |
| `cf-reconcile-orders`             | 03:00 daily                | Replay yesterday's GonnaOrder orders against `orders` |
| `cf-reconcile-vouchers`           | 06:00 daily                | Compare GonnaOrder voucher balance vs `benefit_ledger` expected |
| `cf-monthly-digest`               | 09:00 on day 1 of month    | Email company admins a prev-month summary   |

### 6.5 GonnaOrder webhook (`/.netlify/functions/gonnaorder-webhook`)

Receives events:

- `order.placed` → upsert `orders` + `order_items`; compute `order_benefit_uses` by decoding which voucher(s) were used; decrement `benefit_ledger.redeemed_amount`.
- `order.status_changed` → update `orders.status`.
- `order.cancelled` → update `orders.status`; refund `benefit_ledger.redeemed_amount`.

Signature verification uses `GONNAORDER_WEBHOOK_SECRET`.

### 6.6 Reads

Client reads go direct to Supabase via `@supabase/supabase-js` and are filtered by RLS. Typed wrappers live in `src/lib/api/*.ts`. Nothing sensitive (e.g. service-role mutations, cross-tenant reads) is reachable from the client.

---

## 7. GonnaOrder Integration

### 7.1 Responsibilities split

| Thing                                         | Owner       |
| --------------------------------------------- | ----------- |
| Menu (dishes, variants, prices, categories)   | GonnaOrder  |
| Shop configuration (hours, delivery zones)    | GonnaOrder  |
| Cart + checkout UI + card payment             | GonnaOrder  |
| Voucher balance + redemption at checkout      | GonnaOrder  |
| **What employees see at the shop URL**        | GonnaOrder  |
| Company / employee / benefit data             | **CF**      |
| Matchmaking decisions (which shops appear)    | **CF**      |
| Benefit *period* logic (daily/weekly/monthly allowance, carryover, resets) | **CF** |
| Benefit rules (caps, date windows, tag filters)| **CF**     |
| Scheduled top-ups of the GonnaOrder voucher   | **CF**      |
| Invoice generation                            | Vendor      |
| Order history aggregation + reporting         | **CF**      |

> **Critical detail about GonnaOrder vouchers:** A GonnaOrder voucher is just a code with a current balance. It has no concept of "per-day allowance" or "resets monthly" — those are CF's problem. An existing n8n script tops up vouchers on a schedule; CF will replace it with a scheduled Netlify Function that does the same thing, driven by `benefit_topups`.

### 7.2 Flows

**Benefit → Voucher: mint-once.** When a benefit is first assigned to an employee, CF calls GonnaOrder's voucher API once to mint a voucher code and stores it on `benefit_assignments.gonnaorder_voucher_code`. Initial balance = 0 (the first scheduled top-up will fund it) — or the opening tick amount if the assignment happens after the cadence's trigger time. The voucher code is *permanent* for the life of the assignment; CF never re-mints.

**Benefit → Voucher: scheduled top-up.** A Netlify Scheduled Function, `cf-run-benefit-topups`, executes every morning at 05:00 Europe/Athens. For every active `benefit_assignment`:

1. Determine whether a top-up is due for today based on `benefit_rules.topup_cadence` (daily → every day; weekly → on a fixed day-of-week; monthly → on day 1; one_time → at assignment time only).
2. Consult `benefit_rules.days_of_week` and `blackout_dates` — if today is excluded, write a `benefit_topups` row with `status = 'skipped'` and stop.
3. Compute the effective amount to add, honoring `carryover`:
   - `reset`: read current balance from GonnaOrder; compute `delta = topup_amount - current_balance`. If `delta <= 0`, skip.
   - `accumulate`: `delta = topup_amount`.
4. Upsert a `benefit_topups` row with `status = 'pending'` keyed on `(assignment_id, scheduled_for)` (idempotent — retry-safe).
5. Call GonnaOrder's voucher top-up API with `delta`.
6. On success: mark the row `applied`, increment `benefit_ledger.granted_amount` by `delta`, and write an `audit_log` row.
7. On failure: mark the row `failed` with `error_detail`. A separate retry pass runs at 08:00 and 12:00 to pick up `failed` rows.

**Restrictions syncing.** When a benefit or its rules change, CF calls GonnaOrder's voucher-update endpoint once for every assignment of that benefit to mirror: `per_order_min`, `per_order_max`, allowed/blocked tags, allowed shops (from `allowed_vendor_ids` ∩ the company's matchmaking). Daily cap is *not* pushed to GonnaOrder — it's enforced implicitly by the daily top-up amount (and GonnaOrder's own per-order max).

**Employee "start order".** Employee clicks "Order now" in the CF portal. CF:

1. Resolves their active `matchmaking_agreements` (via their company's agreements).
2. Picks the target shop (today: one active agreement's first shop; future: a chooser).
3. Refreshes the voucher balance if needed.
4. Redirects to `https://<shop>.gonnaorder.com?voucher=<code>&ref=cf-<employeeId>`.

**Order ingest.** GonnaOrder posts to `/gonnaorder-webhook`. CF upserts the order, links it to employee + company + agreement + benefit uses, updates the ledger.

**Shop provisioning.** When a matchmaking agreement is created, CF calls GonnaOrder to create (or link to) a shop, set delivery address(es) and time windows, and pin the menu. (If the shop already exists in GonnaOrder, CF just stores the `gonnaorder_shop_id`.)

### 7.3 Reconciliation

A nightly Netlify Scheduled Function (`cf-reconcile-orders`) fetches the previous day's orders from GonnaOrder's list API and cross-checks against `orders` to catch any webhook drops. Mismatches are logged to `audit_log` with action `reconcile_miss`.

A second reconciliation (`cf-reconcile-vouchers`) runs daily at 06:00 (one hour after top-ups). For every active assignment it reads the current GonnaOrder voucher balance and compares it against CF's expected balance (`benefit_ledger.granted_amount - benefit_ledger.redeemed_amount`). Drifts over €0.01 are logged as `reconcile_voucher_drift`. This is our safety net against missed webhooks and failed top-ups.

### 7.4 Replacing the existing n8n script

An n8n workflow currently runs the voucher top-up loop for early CF companies. The cutover plan:

1. Ship `cf-run-benefit-topups` to production; run it in **dry-run mode** (no API calls, just writes `benefit_topups` rows with `status = 'pending'`).
2. Compare the rows CF would have written against n8n's actual executions for 7 days. Any mismatch gets triaged.
3. Flip `cf-run-benefit-topups` to live mode on a per-company basis (start with one company).
4. Decommission the n8n workflow once all companies have migrated.

The n8n script is a reference implementation, not a source of truth — CF's `benefit_topups` ledger is authoritative from day one.

---

## 8. Workflows (MVP v1)

### 8.1 Onboarding a company (Super Admin)

1. CF operator creates a `companies` row (`cf-create-company`), filling in name, VAT, billing email.
2. Adds company offices with addresses.
3. Invites the first Company Admin (`cf-invite-company-admin`) — they receive a signup link.
4. Creates matchmaking agreements (`cf-create-agreement`) once vendors are identified.

### 8.2 Creating a benefit (Company Admin)

1. Company Admin opens `/company/benefits` → "New benefit".
2. Fills in name, type (monthly_allowance | weekly_credit | one_time), amount, valid dates.
3. Configures rules: daily cap, vendor filter, tag filter, days-of-week, blackout dates.
4. Picks who it applies to (all employees | group | manual list).
5. `company-create-benefit` + `company-assign-benefit` → one voucher code is minted per assigned employee (initial balance 0) and stored on `benefit_assignments` → `benefit_ledger` rows initialized for the current cycle. The next run of `cf-run-benefit-topups` funds the vouchers per the configured cadence.

### 8.3 Employee orders

1. Employee logs in, lands on `EmployeeHome.tsx`.
2. Sees their active benefits with remaining balances (from `my_benefits` view).
3. Clicks "Order now" → `employee-start-order` redirects to GonnaOrder shop with voucher pre-applied.
4. Employee completes checkout in GonnaOrder; card payment (if any) goes to vendor.
5. GonnaOrder webhook hits CF → order is mirrored, ledger updated.

### 8.4 Month-end invoicing

1. Vendor uploads their invoice PDF through a minimal vendor-onboarded endpoint (or, in v1, CF operator uploads on their behalf via Super Admin).
2. Company Admin sees the invoice in `/company/invoices` alongside a CF-computed "benefit redemption total" for cross-check.
3. Company reviews, approves, pays the vendor directly (outside CF).
4. Company Admin marks invoice as paid (`company-mark-invoice-paid`).

### 8.5 Reporting

Company Admin's `/company/reports` shows (v1):

- Employees active this period (count + trend).
- Orders placed (count, average spend, repeat rate).
- Benefit credit granted vs. redeemed (with utilization %).
- Top-up revenue (informational — goes to vendor, not CF).
- Top vendors by redemption.

ESG metrics (consolidation ratio, reusable containers, sustainability tag mix) **deferred to v2**.

---

## 9. Business Rules (MVP v1)

- A benefit is applied only if the order is placed within `valid_from` / `valid_to` AND the rules pass (daily cap, vendor filter, tag filter, day-of-week, blackout).
- Multiple benefits on a single order: applied in ascending `priority` order until the order is fully covered or benefits exhausted. Each benefit's amount is recorded on `order_benefit_uses`.
- A benefit cannot be split across orders — per-order voucher application. Remaining balance carries to the next order.
- Once an order is mirrored with `order_benefit_uses`, redemption is **immutable** unless the order is cancelled (refund flows through the webhook → ledger gets credited back).
- A company must have at least one active agreement with a vendor before that vendor's shop appears in the employee portal.
- Agreements can be paused (hidden from employees, no new orders) or ended (final, historical orders preserved).
- Delivery times and offices are set on `agreement_offices` — GonnaOrder shop configuration is updated when these change.
- `sticker_mode` on an agreement controls whether employee name or anonymized reference is sent to GonnaOrder in the order note.

---

## 10. Non-Functional

- **Bilingual EL/EN** — UI and data. `t()` helper, `_el/_en` columns.
- **Money in cents** — no floats anywhere.
- **Audit log** — every write function appends one row. Super Admin can query.
- **Observability** — Netlify Functions logs via Netlify; Supabase dashboard for DB; Sentry (optional) for frontend errors.
- **Performance** — pages load under 1s on cold cache (list views paginate at 25 rows). Order webhooks process under 300ms (hot path).
- **Backups** — Supabase daily automated backups; 7-day retention on the free tier, extendable.
- **Disaster** — manual runbook in `docs/RUNBOOK.md` (added in Launch Readiness epic).
- **Privacy** — no employee personal data sent to vendors beyond what's needed for an order. `sticker_mode` on the agreement controls name visibility. No PII in `audit_log.before/after` beyond what the admin action exposes.

---

## 11. MVP v1 — In/Out

| Area                                | In v1? |
| ----------------------------------- | ------ |
| Company Admin: benefits CRUD        | Yes    |
| Company Admin: employee roster      | Yes    |
| Company Admin: invoices inbox       | Yes    |
| Company Admin: basic reports        | Yes    |
| Super Admin: companies CRUD         | Yes    |
| Super Admin: vendors CRUD           | Yes    |
| Super Admin: matchmaking agreements | Yes    |
| Employee: login + benefit view      | Yes    |
| Employee: order handoff to GonnaOrder | Yes  |
| GonnaOrder: menu read               | Yes    |
| GonnaOrder: shop provision link     | Yes    |
| GonnaOrder: voucher sync            | Yes    |
| GonnaOrder: order webhook ingest    | Yes    |
| Nightly reconciliation job          | Yes    |
| Vendor Admin UI (custom)            | No — use GonnaOrder native |
| Kitchen consolidation + sticker printing | No — v2 |
| Reusable-container tracking         | No — v2 |
| ESG dashboards                      | No — v2 |
| Custom branded employee ordering UI | No — v2, GonnaOrder themed shop for now |
| Multi-currency                      | No — EUR only |
| SSO / SAML                          | No — v3 |

---

## 12. Open Questions

1. **Domain.** `companyfooding.com`? Temp `cf-app.netlify.app`?
2. **GonnaOrder access.** Who owns the GonnaOrder account, and do we need a sandbox tenant for dev?
3. **Company Admin invite flow.** Is email-only invite enough, or do we need a CSV-based bulk admin invite for v1?
4. **Benefit cycles.** Default = calendar month; do we need custom cycles (e.g. payroll fortnight) in v1?
5. **Vendor invoice source.** Do vendors upload PDFs, or do we pull numbers from GonnaOrder's transaction report and auto-draft invoices?
6. **GDPR / data residency.** Supabase EU region is assumed; confirm.
7. **Employee identity verification.** Is company-email-domain matching sufficient, or do we need per-employee codes at signup?
8. **GonnaOrder voucher API shape.** Does GonnaOrder expose a "set balance" endpoint, or is it add-only? This decides whether `carryover = 'reset'` needs a GET-then-POST dance or a single PUT. The existing n8n script is the reference — we'll read it before finalizing the client.
9. **Default top-up timezone.** All schedules assume Europe/Athens. Is that correct for all CF companies (including any that might be international)?
10. **n8n cutover window.** When do we stop running the existing n8n workflow? Proposed: 7-day dry-run comparison, then per-company cutover.
11. **Top-up failure escalation.** If a voucher top-up has failed on 3 consecutive retries for one employee, who gets alerted? (Super Admin? Company Admin? Both?)

---

## 13. Glossary

- **Matchmaking agreement** — a row linking one company to one vendor with terms (sticker mode, offices, delivery windows).
- **Benefit** — a named pool of credit with rules, owned by a company, consumed by employees.
- **Voucher** — the GonnaOrder-side representation of a CF benefit, minted per employee.
- **Order mirror** — a CF-side row reflecting an order placed in GonnaOrder.
- **Redemption** — the act of a benefit being applied to an order; creates a row in `order_benefit_uses` and decrements `benefit_ledger`.
- **Top-up** — employee's own-money payment on top of benefit coverage, processed by vendor via GonnaOrder. CF records amount only.
- **Sticker mode** — whether kitchen tickets show the employee's real name or an anonymized code.
