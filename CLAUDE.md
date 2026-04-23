# Company Fooding (CF) — Claude Context

Working name for WeCook's B2B enterprise food-benefit platform. The CF name is used
everywhere (repo, Linear team, Supabase project, Netlify site) until rebrand.

## Stack
- React 19.2 + TypeScript 6 + Vite 8
- React Router 7, Zustand 5
- Netlify (hosting + serverless functions in `netlify/functions/`)
- Supabase (Postgres + Auth + Storage) — EU Central
- GonnaOrder (third-party voucher + ordering) — NOT merchant-of-record; vendors
  invoice companies directly

## Local Dev
```bash
netlify dev   # → http://localhost:8888
```
- Vite hot-reloads on every file save — no deploy needed during iteration
- `netlify.toml` has only the `/api/*` redirect — no `/*` catch-all (would break Vite module requests)
- The `/*` SPA fallback lives in `public/_redirects` for production only

## Service-role pattern (from day one — different from Fitpal)
Unlike Fitpal (which uses direct-client + admin RLS and has WEC-121 to migrate),
CF uses **service-role via Netlify Functions from day one**.

- Browser holds the **anon key only** (`VITE_SUPABASE_ANON_KEY`)
- RLS is **narrowed to tenant-scoped READs** (employee reads their own data,
  company admin reads their company's data, super admin reads all)
- All **writes** go through Netlify Functions that use the **service-role key**
  and enforce authorization explicitly via `getCaller()` + `requireRole()`
- Service-role key is **never** exposed to the bundle — imported only from
  `netlify/functions/_shared/supabaseAdmin.ts`

## Git Push Rules — CRITICAL (same as Fitpal)
- **NEVER run git from the workspace folder** — the FUSE mount blocks `unlink`,
  permanently breaking git lock files
- **NEVER push to GitHub unless Ioustinos explicitly says so**
- **Iterate on localhost:8888, batch fixes, commit only on command**
- When a push IS requested, clone fresh to `/tmp/company-fooding-push` and use
  `GIT_DIR` / `GIT_WORK_TREE` overrides (see Fitpal CLAUDE.md for the full
  pattern)

## Project Structure
```
src/
  components/
    guards/RoleGuard.tsx      route gate by app role
    layout/Header.tsx         top bar + lang + logout
  lib/
    supabase.ts               browser anon client
    helpers.ts                fmtMoney, isoDate, addDays, clamp
    translations.ts           makeTr() — bilingual el/en string maps
  pages/
    LoginPage.tsx             email + password sign-in
    EmployeeHome.tsx          employee landing (balance + redirect)
    NotFound.tsx
  store/
    useAuthStore.ts           Zustand — session, user, role, companyId
    useUIStore.ts             Zustand — lang, sidebar
  AdminApp.tsx                super-admin shell (lazy-loaded)
  CompanyApp.tsx              company-admin shell (lazy-loaded)
  App.tsx                     top-level router with role guards
  main.tsx
  index.css

netlify/
  functions/
    _shared/
      supabaseAdmin.ts        service-role client factory
      auth.ts                 getCaller(), requireRole()
      errors.ts               jsonResponse, ok, badRequest, unauthorized, …
      gonnaorder.ts           typed client stub — mintVoucher, topupVoucher,
                              getVoucherBalance
    cf-ping.ts                sanity-check endpoint
```

## Route Topology
- `/login` — public
- `/` — employee home (any authenticated role)
- `/company/*` — company_owner, company_admin
- `/admin/*` — super_admin
- `RoleGuard` redirects non-matching roles to `/` and unauthenticated callers
  to `/login`

## Key Conventions (mirrored from Fitpal)
- **Money in cents** (int). Render with `fmtMoney(cents, lang)`.
- **Bilingual** `_el` / `_en` suffix on user-facing columns; `makeTr(lang)` in UI.
- **Dates** are calendar dates (Europe/Athens) for business logic; use `isoDate()`
  for YYYY-MM-DD.
- **All tables** have `created_at` / `updated_at` (timestamptz) triggers.
- **Enums** declared up-front in the first migration.

## GonnaOrder Integration (summary)
GonnaOrder vouchers are **balance-only** (no period / cadence logic).

CF's job:
1. **Mint once** per (employee, benefit assignment) when a benefit starts.
2. **Top up on a schedule** (CF-owned scheduler — NOT n8n) based on
   `benefits.topup_cadence` (daily / weekly / monthly) and
   `benefits.carryover` (reset / accumulate).
3. **Record every attempt** in `benefit_topups` with a unique constraint on
   `(assignment_id, scheduled_for)` for idempotency.
4. **Reconcile daily** — fetch voucher balances from GonnaOrder and flag drift.

Three-pass retry for failed top-ups: 05:00, 08:00, 12:00 local time.

A working n8n script exists today at Ioustinos's side. We're **not** going to
depend on it — CF's scheduler is built in `netlify/functions/` and runs on
Netlify's scheduled-functions feature. n8n stays as a dry-run parity check for
7 days before per-company cutover.

## Show Before Execute
Before ANY action in Linear, Supabase, GitHub, Netlify, or any other external
system — write out exactly what you plan to do and wait for **explicit
approval from Ioustinos**.

## Docs in this repo
- `docs/SPEC.md` — 13-section technical spec (overview → glossary)
- `docs/LINEAR_PLAN.md` — 8 epics, 49 sub-issues (to become Linear CF-* tickets)
