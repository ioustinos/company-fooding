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
- Linear (team `CF`, project "Company Fooding — MVP v1")

## Local Dev
```bash
npm run dev:netlify   # → http://localhost:8888
```
- Vite hot-reloads on every file save — no deploy needed during iteration
- `CHOKIDAR_USEPOLLING=1` is built into the script (required for FUSE mounts)
- **Build = `vite build`** (not `tsc -b && vite build`). Typecheck is a separate
  non-gating `npm run typecheck`.
- **Redirect priority:** Netlify evaluates `_redirects` BEFORE `netlify.toml`. So
  `/api/*` → functions AND `/*` SPA fallback both live in `public/_redirects`
  in that order. `netlify.toml` has zero redirect rules — stripped to avoid
  the ordering footgun.

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

## Git Push Rules — CRITICAL
- **NEVER run git from the workspace folder** — the FUSE mount blocks `unlink`,
  permanently breaking git lock files
- **NEVER push to GitHub unless Ioustinos explicitly says so.** The iteration
  loop is: edit workspace → Vite hot-reload → batch fixes → commit + push only
  on explicit command. Treat `main` as production — multiple confirmations.
- Credentials live in `<workspace>/.auto-memory/github_credentials.sh`
  (gitignored). The var is `$GITHUB_TOKEN`. Source it at the start of every
  bash call since env doesn't persist across calls.
- Use a fresh `/tmp/company-fooding-pushN` path per session — old paths from
  prior sessions have stale ownership and can't be deleted.
- When a push IS requested, use this pattern:

```bash
source <workspace>/.auto-memory/github_credentials.sh
git config --global --add safe.directory "<workspace>"

PUSH_DIR=/tmp/company-fooding-pushN   # increment N each session
rm -rf "$PUSH_DIR"
git clone --depth 50 -b dev \
  "https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${PROJECT_REPO}.git" "$PUSH_DIR"
cd "$PUSH_DIR"
git config user.email "ioustinos@wecook.gr"
git config user.name "Ioustinos Sarris"
git config --global --add safe.directory "$PUSH_DIR"

export GIT_DIR="$PUSH_DIR/.git"
export GIT_WORK_TREE="<workspace>"

git add src/specific/file.tsx   # specific files only — NEVER git add -A
git commit -m "description"
git push origin dev             # or main for production
```

Branches:
- `dev` → https://dev--company-fooding.netlify.app (once Netlify ↔ repo linked)
- `main` → https://company-fooding.netlify.app (production)

## Infrastructure

### GitHub
- Repo: `ioustinos/company-fooding`
- URL: https://github.com/ioustinos/company-fooding
- Visibility: Private
- Auth: fine-grained PAT in `<workspace>/.auto-memory/github_credentials.sh` (var `$GITHUB_TOKEN`)

### Supabase (`company-fooding`)
- Project ID: `jipkzmtkmpwsuuihghol`
- Region: `eu-central-1`
- DB host: `db.jipkzmtkmpwsuuihghol.supabase.co`
- Dashboard: https://supabase.com/dashboard/project/jipkzmtkmpwsuuihghol
- Supabase URL: `https://jipkzmtkmpwsuuihghol.supabase.co`
- Anon key: in Netlify env (`VITE_SUPABASE_ANON_KEY`) and `.env.local`
- Service role key: in Netlify env only (`SUPABASE_SERVICE_ROLE_KEY`, Functions scope)
- Migrations applied: 01–15 (latest 13/14/15 from 2026-05-15 — see PROJECT_LOG.md)

### Netlify (`company-fooding`)
- Site ID: `74d83bc6-70f3-466f-8caf-4b65756cb36b`
- URL: https://company-fooding.netlify.app
- Dashboard: https://app.netlify.com/projects/company-fooding
- Linked GitHub repo: **NOT YET LINKED** (CF-77 — manual deploys only until linked)
- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `GONNAORDER_API_BASE` (=https://admin.gonnaorder.com/api/v1),
  `GONNAORDER_USERNAME`, `GONNAORDER_PASSWORD`, `CF_ADMIN_TOKEN`,
  `RESEND_FROM_ADDRESS`, `CF_TOPUPS_DRY_RUN`

### Linear
- Workspace: `wecook` (URL: linear.app/wecook)
- Team key: `CF` (team id `2bed62a5-8cfe-4b9c-a97d-d31388a0f988`)
- Project: `Company Fooding — MVP v1` (status `In Progress`)
- Project URL: https://linear.app/wecook/project/company-fooding-mvp-v1-0917b77bd397

### GonnaOrder
- API base: `https://admin.gonnaorder.com/api/v1`
- Auth: login-then-JWT (no static API key). `username` + `password` env vars.
- First customer's store: `5677` (Wecook → Queensway Group canteen)

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
      gonnaorder.ts           REAL client — login+JWT, listOrders paginated
      parseGonnaOrder.ts      GO → CF row mapping (cents, status enum, Athens TZ)
    cf-ping.ts                sanity-check endpoint
    cf-sync-gonnaorder.ts     pull GO orders into CF mirror (admin-token-gated)

scripts/
  fetch-go-orders.py          one-off GO order fetch → JSON (for backfill)
  sql/upsert-go-orders.sql    bulk upsert generated from a JSON dump
  skill-patches/              patches to apply to setup-tech-stack skill source

supabase/migrations/
  01–15                       applied — see PROJECT_LOG.md for what each does
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

**Architectural note (2026-05-15):** A GonnaOrder "store" represents a single
(vendor × company) relationship. Store id lives on `agreement_shops.gonnaorder_shop_id`
(NOT on `vendors`). One store can serve multiple legal entities (e.g.
Queensway Group: 3 sister companies share canteen, all reference store 5677
via separate matchmaking_agreements). Migration 13 dropped the dead
`vendors.gonnaorder_merchant_id` column. Parent-store concept deferred until
needed.

## Show Before Execute
Before ANY action in Linear, Supabase, GitHub, Netlify, or any other external
system — write out exactly what you plan to do and wait for **explicit
approval from Ioustinos**.

## Knowledge layers
1. **Project instructions** (Cowork project brief) — high-level, rarely changes
2. **CLAUDE.md** (this file) — conventions and infrastructure, source of truth
3. **PROJECT_LOG.md** (this repo) — living CTO journal, updated after every major task
4. **Linear** (workspace wecook, team `CF`, project "Company Fooding — MVP v1")
5. **Memory files** in `<workspace>/.auto-memory/` — context, infra, workflow

When starting a new session: read CLAUDE.md and PROJECT_LOG.md, check open Linear
CF-* issues, before asking "what's next".

## Docs in this repo
- `docs/SPEC.md` — 13-section technical spec (overview → glossary)
- `docs/LINEAR_PLAN.md` — 8 epics, 49 sub-issues (mostly tracked as CF-* in Linear now)
- `PROJECT_LOG.md` — CTO journal (append after major tasks)
