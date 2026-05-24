# Company Fooding (CF) — Linear Plan for MVP v1

> Target Linear team: **CF** (new team, to be created under the existing Wecook workspace).
> Issue keys below use placeholder numbering (E1, E1.1, ...) until the team is created and Linear assigns real IDs.
> This file is the *source* for the Linear tree. When approved, I will create epics first, then sub-issues as children, using the titles and descriptions here verbatim.

---

## Conventions

- Eight **epics** (E1–E8). Each epic becomes one Linear issue with `label: epic` and sub-issues linked as children.
- Sub-issues carry **acceptance criteria** (AC) bullets and, where relevant, a **blockedBy** line.
- Labels used: `epic`, `backend`, `frontend`, `infra`, `db`, `integration`, `docs`, `ux`, `security`.
- Priorities: P1 = must-ship-for-MVP, P2 = should-ship, P3 = nice-to-have. Everything here is P1 or P2; P3 goes in a separate "v2 backlog" epic not created at this stage.

---

## Epic E1 — Foundation

**Goal:** A new repo scaffolded, Supabase + Netlify provisioned, CI green, empty app routes accessible, auth wiring in place. Nothing domain-specific yet.

**Labels:** `epic`, `infra`, `backend`, `frontend`.

### E1.1 — Scaffold repo (Vite + React 19 + TS + Netlify)
- Labels: `infra`, `frontend`.
- AC:
  - `npm run dev` serves `localhost:5173` with a single "CF" page.
  - `netlify dev` serves `localhost:8888` with Functions reachable under `/api/*`.
  - `tsc -b` passes with zero errors.
  - `eslint .` passes.
  - Directory layout matches §3 of SPEC.md.
  - `CLAUDE.md` exists and documents stack + git push rules + Show Before Execute.

### E1.2 — Provision Supabase project
- Labels: `infra`, `db`.
- AC:
  - Supabase project created in EU region.
  - Service-role key + anon key + URL added to Netlify env vars.
  - `supabase/migrations/` directory committed (empty + a `0000_init.sql` that installs `pgcrypto` and the `updated_at` trigger function).

### E1.3 — Provision Netlify site
- Labels: `infra`.
- AC:
  - Netlify site connected to GitHub repo (branch: `dev` and `main`).
  - `dev` branch auto-deploys to `dev--cf-platform.netlify.app`.
  - `main` branch auto-deploys to `cf-platform.netlify.app` (temp URL until custom domain).
  - Env vars configured for both contexts.

### E1.4 — Auth scaffold + role resolution
- Labels: `backend`, `frontend`, `security`.
- AC:
  - `useAuthStore` exposes `user`, `session`, `cfRole`, `companyId`, `companyRole`, `employeeId`.
  - `buildFullUser(user)` queries `cf_admins`, `company_users`, `employees` to resolve tenant context.
  - `<Guard>` components for each role: `<CfGuard>`, `<CompanyGuard>`, `<EmployeeGuard>`.
  - `AuthModal` supports email + password signup + login.
  - Login redirects by role: cf → `/admin`, company → `/company`, employee → `/`.
- blockedBy: E1.1, E1.2.

### E1.5 — Shared Netlify Function helpers
- Labels: `backend`, `security`.
- AC:
  - `_shared/auth.ts` exports `resolveActor(req)` that validates JWT and returns role/tenant context.
  - `_shared/supabaseAdmin.ts` exports a service-role client factory.
  - `_shared/errors.ts` exports a typed error envelope + HTTP wrapper.
  - A demo `cf-ping` function returns `{ ok: true, actor }` for any authenticated caller.
- blockedBy: E1.2.

### E1.6 — CI: type-check + lint on PR
- Labels: `infra`.
- AC:
  - GitHub Action runs `npm ci && npm run build && npm run lint` on pull requests.
  - Red check blocks merge to `dev` and `main`.

---

## Epic E2 — Data model

**Goal:** All migrations for MVP v1 entities, RLS policies, seed script.

**Labels:** `epic`, `db`, `security`.

### E2.1 — Migration 01: enums + core identity
- AC: migration creates enums (`cf_role`, `company_role`, `benefit_type`, `benefit_status`, `agreement_status`, `invoice_status`, `order_source`, `order_status_mirror`, `sticker_mode`) and tables `cf_admins`, `companies`, `company_offices`, `company_users`, `employees`, `vendors`. Idempotent.

### E2.2 — Migration 02: matchmaking
- AC: creates `matchmaking_agreements`, `agreement_offices`, `agreement_shops`. Foreign keys cascade-delete appropriately. `gonnaorder_shop_id` unique globally.

### E2.3 — Migration 03: benefits + assignments + ledger + topups
- AC: creates enums `topup_cadence`, `carryover_mode`, `topup_status`; tables `benefits`, `benefit_rules` (including `topup_cadence`, `topup_amount`, `carryover` columns), `benefit_assignments` (including `gonnaorder_voucher_code` column), `benefit_ledger`, `benefit_topups`. Ledger upsert key: (`benefit_id`, `employee_id`, `cycle_start`). `benefit_topups` unique on (`assignment_id`, `scheduled_for`) for idempotent retry.

### E2.4 — Migration 04: orders mirror
- AC: creates `orders`, `order_items`, `order_benefit_uses`. `(source, external_order_id)` unique.

### E2.5 — Migration 05: invoices
- AC: creates `invoices`, `invoice_line_items`.

### E2.6 — Migration 06: system tables + audit log
- AC: creates `settings`, `audit_log`. Seeds `settings` keys from SPEC §4.7.

### E2.7 — Migration 07: RLS helpers + policies
- AC: installs `is_cf_admin()`, `current_company_id()`, `current_employee_id()`, `my_benefits` view. Installs SELECT policies for each tenant-bounded table per SPEC §5.3.
- blockedBy: E2.1–E2.6.

### E2.8 — Migration 08: triggers + handle_new_user
- AC: `updated_at` triggers on all mutable tables; `handle_new_user()` function + trigger on `auth.users.INSERT` matches invite → `company_users` / `employees.user_id` accordingly.
- blockedBy: E2.1.

### E2.9 — Seed script (local dev)
- Labels: `db`, `docs`.
- AC: `supabase/seed.sql` inserts: 1 CF owner (email tied to Ioustinos), 1 demo company with 2 offices, 1 demo vendor, 1 active matchmaking agreement, 2 benefits, 3 demo employees. Idempotent via upserts.

### E2.10 — Generated ERD doc
- Labels: `docs`, `db`.
- AC: `supabase/schema_erd.html` is regenerated and committed after the final migration; linked from `CLAUDE.md`.

---

## Epic E3 — Super Admin panel

**Goal:** CF operators can onboard companies, vendors, and matchmaking agreements through the UI. All writes go through `cf-*` Netlify Functions.

**Labels:** `epic`, `frontend`, `backend`.

### E3.1 — `/admin` route tree + navigation
- AC: `<AdminApp>` with left nav: Dashboard, Companies, Vendors, Agreements, Audit log, Settings. Lazy-loaded under `<CfGuard>`. Header shows current CF operator + sign-out.

### E3.2 — Companies: list + create + edit
- Labels: `frontend`, `backend`.
- AC: `/admin/companies` lists active + suspended companies with search and pagination. "New company" form calls `cf-create-company`. Edit drawer calls `cf-update-company`. Office list editable inline.
- blockedBy: E2.1, E1.5.

### E3.3 — Vendors: list + create + edit
- Labels: `frontend`, `backend`.
- AC: `/admin/vendors` — same shape as Companies. Form fields: name, legal_name, vat_number, contact_email, discount_percentage (0–100), discount_applies_to (benefit_price | final_price), tags (chip input). No GO identifier on the vendor — that's collected per-relationship at agreement time (E3.4).
- blockedBy: E2.1, E1.5.

### E3.4 — Matchmaking Agreements: list + create + edit
- Labels: `frontend`, `backend`.
- AC: `/admin/agreements`. Form: pick company, vendor, offices (multi), delivery windows per office, sticker mode, reusable container setting, dates, shops. Status transitions: active ↔ paused, ended (terminal).
- blockedBy: E2.2, E6.2 (shop provisioning).

### E3.5 — Invite a Company Admin
- Labels: `backend`, `security`.
- AC: `cf-invite-company-admin` sends a signup email (Resend). Invite row stored in a `invites` table (added in E2 addendum or under this issue). On successful signup, post-signup trigger binds to `company_users`.

### E3.6 — Audit log viewer
- Labels: `frontend`, `backend`.
- AC: `/admin/audit` paginates `audit_log`. Filters by actor, action, entity_table, date range. Read-only.
- blockedBy: E2.6.

### E3.7 — Settings page
- Labels: `frontend`, `backend`.
- AC: `/admin/settings` renders editable form bound to `settings` table. Writes go through `cf-update-setting` (added in this issue).
- blockedBy: E2.6.

---

## Epic E4 — Company Admin panel

**Goal:** Company HR / facility managers manage benefits, employees, and invoices; see reports.

**Labels:** `epic`, `frontend`, `backend`.

### E4.1 — `/company` route tree + navigation
- AC: `<CompanyApp>` with nav: Dashboard, Benefits, Employees, Invoices, Reports, Offices, Team. Wrapped in `<CompanyGuard>`. Header shows company name + switcher placeholder (single-company for v1).

### E4.2 — Benefits: list + create/edit + assign
- Labels: `frontend`, `backend`.
- AC: `/company/benefits` lists active + archived. Form covers all fields in `benefits` + `benefit_rules`. Assign modal supports "all employees" | "select groups" | "pick individuals". Writes: `company-create-benefit`, `company-update-benefit`, `company-assign-benefit`, `company-archive-benefit`.
- blockedBy: E2.3, E1.5.

### E4.3 — Benefit assign → voucher mint (one-time)
- Labels: `backend`, `integration`.
- AC: On `company-assign-benefit`, mint one GonnaOrder voucher per employee with initial balance 0 and store the code on `benefit_assignments.gonnaorder_voucher_code`. On archive or `company-update-benefit` rule changes, push restriction updates (tags, per-order min/max, allowed shops) to GonnaOrder for every existing voucher. Never re-mint; the code is stable for the life of the assignment. Retries with backoff on transient failures.
- blockedBy: E4.2, E6.3.

### E4.4 — Employees: list + import CSV + edit
- Labels: `frontend`, `backend`.
- AC: `/company/employees` lists employees with status filter. "Import CSV" wizard validates columns (email, display_name, external_ref, default_office_id) and calls `company-import-employees`. Edit / suspend per row.
- blockedBy: E2.1.

### E4.5 — Invoices inbox
- Labels: `frontend`, `backend`.
- AC: `/company/invoices` lists invoices with status filter. Each row shows vendor, period, total, CF-computed redemption total (for cross-check), PDF link. Actions: "mark paid" (`company-mark-invoice-paid`), "dispute" (`company-dispute-invoice`). v1 expects CF operator to upload the PDF; company sees them here.
- blockedBy: E2.5.

### E4.6 — Reports dashboard
- Labels: `frontend`, `backend`.
- AC: `/company/reports` shows adoption + financial KPIs per SPEC §8.5 for a selectable period. CSV export via `company-export-report` returns a signed URL. No ESG metrics in v1.
- blockedBy: E2.4, E2.3.

### E4.7 — Offices management
- Labels: `frontend`, `backend`.
- AC: `/company/offices` list + CRUD for `company_offices`. `is_default` can be toggled.

### E4.8 — Team management (company admins)
- Labels: `frontend`, `backend`.
- AC: `/company/team` lists `company_users` with role. Invite / revoke. Invites follow E3.5 pattern but scoped to this company.

---

## Epic E5 — Employee experience & GonnaOrder handoff

**Goal:** Employees log in, see their benefits, and bounce to the correct GonnaOrder shop with their voucher pre-applied.

**Labels:** `epic`, `frontend`, `backend`, `integration`.

### E5.1 — Employee login + home
- AC: Employee lands on `/` post-login. `EmployeeHome.tsx` reads `my_benefits` view and shows each active benefit with remaining cents, rules summary, and an "Order now" button.
- blockedBy: E2.7, E1.4.

### E5.2 — Start order handoff
- Labels: `backend`, `integration`.
- AC: `employee-start-order` resolves the employee's active agreements, picks the first shop (v1 — agreement chooser deferred), refreshes the voucher balance, and returns a redirect URL. Front-end does the redirect. If no active agreement, returns a friendly "no vendor yet" error.
- blockedBy: E6.3, E2.2.

### E5.3 — Order history (employee)
- Labels: `frontend`, `backend`.
- AC: `/orders` lists this employee's past orders from `orders` (via RLS). Each row shows vendor, date, items count, total, benefit applied, top-up.
- blockedBy: E2.4.

### E5.4 — Language toggle (EL / EN)
- AC: Header lang toggle persists in `useUIStore` and `user_prefs` (added in this issue). All employee pages use `t()`.

---

## Epic E6 — GonnaOrder integration

**Goal:** A typed, testable client for GonnaOrder's API + webhook ingestion + nightly reconciliation.

**Labels:** `epic`, `backend`, `integration`.

### E6.1 — GonnaOrder API client
- AC: `netlify/functions/_shared/gonnaorder.ts` exports typed functions: `getMerchant`, `listShops`, `getShop`, `getMenu`, `mintVoucher`, `updateVoucher`, `disableVoucher`, `listOrders`. Uses `GONNAORDER_API_KEY`. Retries with exponential backoff (3 attempts). Unit-tested against recorded fixtures.
- blockedBy: E1.5.

### E6.2 — Shop provisioning hook
- AC: On `cf-create-agreement` / `cf-update-agreement`, CF updates the GonnaOrder shop's delivery address(es) and time windows from `agreement_offices`. `sticker_mode` is encoded in the shop's default order note template.
- blockedBy: E6.1, E3.4.

### E6.3 — Voucher mint-on-assign + restriction sync
- AC: `mintVoucherForAssignment(assignment_id)` helper — idempotent per assignment. Creates a GonnaOrder voucher with initial balance 0 and the full restriction set derived from `benefit_rules` (allowed_tags, blocked_tags, allowed shops from matchmaking, per-order min/max). `syncVoucherRestrictions(assignment_id)` updates those restrictions in place when rules change. Disabling a voucher on archive is a separate path that zeroes the balance and flags it inactive in GonnaOrder. Does NOT handle the recurring top-ups (those live in E6.7).
- blockedBy: E6.1, E2.3.

### E6.4 — Order webhook ingest
- AC: `gonnaorder-webhook` verifies signature, upserts `orders` + `order_items`, decodes which voucher(s) applied to write `order_benefit_uses`, updates `benefit_ledger.redeemed_amount`. Handles `order.cancelled` as a refund. Idempotent on `external_order_id`.
- blockedBy: E6.1, E2.4.

### E6.5 — Order reconciliation job
- AC: `cf-reconcile-orders` is a Netlify Scheduled Function running at 03:00 Europe/Athens. For yesterday's date, it fetches GonnaOrder's order list per shop, and for any order missing in `orders` replays webhook logic. Drifts logged to `audit_log` with `action = 'reconcile_miss'`.
- blockedBy: E6.4.

### E6.6 — Fixture recorder + contract tests
- Labels: `backend`, `integration`, `infra`.
- AC: Small CLI script that, given API credentials, records responses to `tests/fixtures/gonnaorder/*.json`. Contract tests in Vitest replay fixtures and assert our typed client's parsing stays correct.

### E6.7 — Voucher top-up scheduler
- Labels: `backend`, `integration`, `infra`.
- AC: `cf-run-benefit-topups` Netlify Scheduled Function runs at 05:00, 08:00, 12:00 Europe/Athens. At each run:
  - Enumerates active `benefit_assignments` and decides if a top-up is due today per `topup_cadence`.
  - Honors `benefit_rules.days_of_week` and `blackout_dates` (skip with status `skipped`).
  - For `carryover = 'reset'`: reads current voucher balance from GonnaOrder, computes `delta = topup_amount - current_balance`, skips if `delta <= 0`.
  - For `carryover = 'accumulate'`: `delta = topup_amount`.
  - Upserts `benefit_topups` keyed on `(assignment_id, scheduled_for)` — idempotent across the three daily passes.
  - Calls the GonnaOrder voucher top-up API with `delta`.
  - On success: row → `applied`, increments `benefit_ledger.granted_amount`, writes audit log.
  - On failure: row → `failed` with `error_detail`; picked up on the next pass; after 3 consecutive failed passes, emits an alert per E8.6's alerting lane.
  - Supports a `CF_TOPUPS_DRY_RUN=true` env flag that writes `benefit_topups` rows without calling GonnaOrder — used for the n8n-parity comparison in E6.8.
- blockedBy: E6.1, E6.3, E2.3.

### E6.8 — n8n parity comparison + cutover
- Labels: `integration`, `docs`.
- AC: A one-off Vitest script ingests the n8n execution log (CSV export from n8n) for a 7-day window and compares it to what CF's `benefit_topups` rows say for the same period in dry-run mode. Discrepancies are reported row-by-row. Acceptance = zero unexplained discrepancies over 7 consecutive days. Accompanying doc `docs/N8N_CUTOVER.md` records the comparison output and the per-company cutover order.
- blockedBy: E6.7.

### E6.9 — Voucher balance reconciliation job
- Labels: `backend`, `integration`.
- AC: `cf-reconcile-vouchers` Netlify Scheduled Function runs at 06:00 Europe/Athens (one hour after the morning top-up pass). For every active assignment, fetches the current GonnaOrder voucher balance and compares it against `benefit_ledger.granted_amount - benefit_ledger.redeemed_amount`. Drifts > €0.01 are logged to `audit_log` as `reconcile_voucher_drift` and surfaced in E8.6's dashboard.
- blockedBy: E6.7, E6.4.

---

## Epic E7 — Invoicing & reporting

**Goal:** Vendors (via CF operator in v1) upload monthly invoices; CF cross-checks against its redemption ledger; company sees everything in one tab with CSV export.

**Labels:** `epic`, `backend`, `frontend`.

### E7.1 — Invoice upload (Super Admin)
- AC: `/admin/invoices/new` form — pick vendor + company + period, upload PDF (stored in Supabase Storage bucket `invoice-pdfs`, admin-only read), enter external_ref + total. Stored as `invoices` row with `status = 'issued'`.
- blockedBy: E2.5.

### E7.2 — Redemption summary per invoice
- AC: Server-side helper `computeRedemptionTotal(vendor_id, company_id, period)` sums `order_benefit_uses.amount` across orders in the period. Surfaced on the invoice row in both `/admin/invoices` and `/company/invoices`.
- blockedBy: E7.1, E2.4.

### E7.3 — Dispute flow
- AC: `company-dispute-invoice` sets status to `disputed` and records the reason. CF operator sees the dispute in `/admin/invoices`. No automated resolution in v1.
- blockedBy: E7.1.

### E7.4 — Report CSV export
- AC: `company-export-report` generates a CSV of orders for the selected period (one row per order, with employee, vendor, benefit applied, top-up, total) and returns a signed URL to download. Super Admin version exports across all companies.
- blockedBy: E4.6.

### E7.5 — Monthly digest email
- Labels: `backend`, `integration`.
- AC: First of each month at 09:00 Europe/Athens, Netlify Scheduled Function emails each Company Admin a digest (prev-month orders, redeemed, top-up, # of active employees). Uses Resend.

---

## Epic E8 — Launch readiness

**Goal:** Everything non-feature that has to happen before we can show CF to a real customer.

**Labels:** `epic`, `docs`, `infra`, `ux`.

### E8.1 — End-to-end happy-path test
- Labels: `infra`.
- AC: Playwright test: CF operator creates company + agreement → company admin creates benefit → employee orders via GonnaOrder (stubbed) → webhook ingests → report shows redemption. Runs on CI against preview deploy.

### E8.2 — Demo data seed for staging
- AC: Staging Supabase has one "Acme Inc" company, one "Pizzeria Demo" vendor, one active agreement, 3 benefits, 5 demo employees. Re-seedable via `supabase db reset`.

### E8.3 — RUNBOOK.md
- Labels: `docs`.
- AC: `docs/RUNBOOK.md` covers: rotating secrets, restoring from backup, pausing all agreements, disabling a single vendor, hot-patching a benefit rule.

### E8.4 — Onboarding docs for Company Admins
- Labels: `docs`, `ux`.
- AC: `/company/help` route + `docs/company-admin-guide.md`. Covers: creating a benefit, importing employees, reviewing invoices. Bilingual.

### E8.5 — Error + empty states pass
- Labels: `frontend`, `ux`.
- AC: Every list page has a non-generic empty state. Every form surfaces per-field errors inline. Global toast for unexpected errors with a "report" button.

### E8.6 — Observability pass
- Labels: `infra`.
- AC: Sentry (or Netlify-native equivalent) wired for frontend. Netlify Function logs piped to a queryable destination (Logtail / Datadog — to be chosen). Dashboards for: daily orders, webhook failures, reconciliation drift.

### E8.7 — Go-live checklist
- Labels: `docs`.
- AC: `docs/GO_LIVE.md` — explicit checklist: env vars set in prod, custom domain pointed, email sender verified, backups confirmed, owner CF admin seeded, monitoring live, demo account purged.

---

## Epic dependency map (at a glance)

```
E1 ─────┬─────▶ E2 ─────┬─────▶ E3 ─────┐
        │                │                │
        └─────▶ E1.5 ────┤                ├─────▶ E7 ─────▶ E8
                          │                │
                          ├─────▶ E4 ─────┤
                          │                │
                          ├─────▶ E6 ─────┤
                          │                │
                          └─────▶ E5 ─────┘
```

---

## Initial issue count

- 8 epics
- 56 sub-issues (revised from 49; GonnaOrder top-up expansion added E6.7, E6.8, E6.9 + a few other decompositions during refinement)

Rough t-shirt sizing (ordinal, not absolute):

| Epic                          | Sub-issues | Effort |
| ----------------------------- | ---------- | ------ |
| E1 Foundation                 | 6          | M      |
| E2 Data model                 | 10         | L      |
| E3 Super Admin panel          | 7          | L      |
| E4 Company Admin panel        | 8          | XL     |
| E5 Employee experience        | 4          | M      |
| E6 GonnaOrder integration     | 9          | XL     |
| E7 Invoicing & reporting      | 5          | L      |
| E8 Launch readiness           | 7          | M      |

---

## Notes for execution

- I will create the Linear team **CF** first, then project "Company Fooding", then epics, then sub-issues.
- Sub-issues inherit their epic's project; `blockedBy` is set using the Linear API after creation (needs two-pass: create all, then link).
- Labels should be created as a batch before any issues: `epic`, `backend`, `frontend`, `infra`, `db`, `integration`, `docs`, `ux`, `security`.
- After creation, I'll print the final Linear-key-to-placeholder mapping back into this file so future edits can reference stable keys (CF-1, CF-2, …).

---

## Final CF-* mapping (created 2026-04-23)

Team: **Company Fooding** (`CF`) · Project: [Company Fooding — MVP v1](https://linear.app/wecook/project/company-fooding-mvp-v1-0917b77bd397)

### Epics
| E-# | Linear key | Title |
|-----|-----------|-------|
| E1  | CF-1      | E1 — Foundation |
| E2  | CF-2      | E2 — Data model |
| E3  | CF-3      | E3 — Super Admin panel |
| E4  | CF-4      | E4 — Company Admin panel |
| E5  | CF-5      | E5 — Employee experience & GonnaOrder handoff |
| E6  | CF-6      | E6 — GonnaOrder integration |
| E7  | CF-7      | E7 — Invoicing & reporting |
| E8  | CF-8      | E8 — Launch readiness |

### Sub-issues

| E-# | Linear key | Title |
|-----|-----------|-------|
| E1.1  | CF-9  | Scaffold repo (Vite + React 19 + TS + Netlify) |
| E1.2  | CF-10 | Provision Supabase project |
| E1.3  | CF-11 | Provision Netlify site |
| E1.4  | CF-12 | Auth scaffold + role resolution |
| E1.5  | CF-13 | Shared Netlify Function helpers |
| E1.6  | CF-14 | CI: type-check + lint on PR |
| E2.1  | CF-15 | Migration 01: enums + core identity |
| E2.2  | CF-16 | Migration 02: matchmaking |
| E2.3  | CF-17 | Migration 03: benefits + assignments + ledger + topups |
| E2.4  | CF-18 | Migration 04: orders mirror |
| E2.5  | CF-19 | Migration 05: invoices |
| E2.6  | CF-20 | Migration 06: system tables + audit log |
| E2.7  | CF-21 | Migration 07: RLS helpers + policies |
| E2.8  | CF-22 | Migration 08: triggers + handle_new_user |
| E2.9  | CF-23 | Seed script (local dev) |
| E2.10 | CF-24 | Generated ERD doc |
| E3.1  | CF-25 | /admin route tree + navigation |
| E3.2  | CF-26 | Companies: list + create + edit |
| E3.3  | CF-27 | Vendors: list + create + edit |
| E3.4  | CF-28 | Matchmaking Agreements: list + create + edit |
| E3.5  | CF-29 | Invite a Company Admin |
| E3.6  | CF-30 | Audit log viewer |
| E3.7  | CF-31 | Settings page |
| E4.1  | CF-32 | /company route tree + navigation |
| E4.2  | CF-33 | Benefits: list + create/edit + assign |
| E4.3  | CF-34 | Benefit assign → voucher mint (one-time) |
| E4.4  | CF-35 | Employees: list + import CSV + edit |
| E4.5  | CF-36 | Invoices inbox |
| E4.6  | CF-37 | Reports dashboard |
| E4.7  | CF-38 | Offices management |
| E4.8  | CF-39 | Team management (company admins) |
| E5.1  | CF-40 | Employee login + home |
| E5.2  | CF-41 | Start order handoff |
| E5.3  | CF-42 | Order history (employee) |
| E5.4  | CF-43 | Language toggle (EL / EN) |
| E6.1  | CF-44 | GonnaOrder API client |
| E6.2  | CF-45 | Shop provisioning hook |
| E6.3  | CF-46 | Voucher mint-on-assign + restriction sync |
| E6.4  | CF-47 | Order webhook ingest |
| E6.5  | CF-48 | Order reconciliation job |
| E6.6  | CF-49 | Fixture recorder + contract tests |
| E6.7  | CF-50 | Voucher top-up scheduler |
| E6.8  | CF-51 | n8n parity comparison + cutover |
| E6.9  | CF-52 | Voucher balance reconciliation job |
| E7.1  | CF-53 | Invoice upload (Super Admin) |
| E7.2  | CF-54 | Redemption summary per invoice |
| E7.3  | CF-55 | Dispute flow |
| E7.4  | CF-56 | Report CSV export |
| E7.5  | CF-57 | Monthly digest email |
| E8.1  | CF-58 | End-to-end happy-path test |
| E8.2  | CF-59 | Demo data seed for staging |
| E8.3  | CF-60 | RUNBOOK.md |
| E8.4  | CF-61 | Onboarding docs for Company Admins |
| E8.5  | CF-62 | Error + empty states pass |
| E8.6  | CF-63 | Observability pass |
| E8.7  | CF-64 | Go-live checklist |

### Notes on execution
- Circular plan-doc edge E3.4 ↔ E6.2 resolved one-directionally: **CF-28 is blockedBy CF-45**; the reverse edge is tracked in CF-45's description only, not as a Linear relation, to keep the graph acyclic.
- All sub-issues that specify a `blockedBy:` line in the plan doc above have been linked via Linear relations.
