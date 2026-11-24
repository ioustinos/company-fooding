# Company Fooding (CF) / Orexis — Claude Context

WeCook's B2B enterprise food-benefit platform. **Orexis** is the new name for the whole
project (decision in the Caterplan handoff, 2026-11). The UI already says "orexi"; the
CF name stays on infra (repo, Linear team, Supabase project, Netlify site) until the
rebrand is done. Sub-products get their own names (e.g. **Caterplan**), never "Orexis".

Development runs in **Claude Code on Ioustinos's Mac** since 2026-11-16 (see
`docs/CLAUDE-CODE-SETUP.md`). Real git, `gh`, `supabase` and `netlify` CLIs. The repo is
the memory: this file = rules + infra + decisions, `PROJECT_LOG.md` = history.

## Team process
Read `docs/TEAM-PROCESS.md` and `docs/REUSE-MAP.md` before any work. Your lane is in
your session title. Ioustinos talks only to the Task Manager; decisions for him live on
`../FOR-IOUSTINOS.md`.

| Session | Owns |
|---|---|
| Orexxis · Task Manager | tickets, routing, HANDOFF / PROJECT_LOG, release approval file — no code |
| Orexxis · Dev App | screens (`src/pages`, shells, store, components) + admin CRUD functions |
| Orexxis · Dev Engine | GonnaOrder sync/webhook, top-ups, deal rules, billing, reports |
| Orexxis · Dev Caterplan | `caterplan/` in worktree `../company-fooding-caterplan`, branch `caterplan` |
| Orexxis · Data | SQL, data repair, imports, backfills, reports — no app code |
| Orexxis · QA | verdicts, reuse map — no code, data or statuses |

## Operating rules (Ioustinos's own — not sandbox workarounds)
1. **Show before execute.** Before ANY write to Linear, Supabase, GitHub, Netlify,
   GonnaOrder, Slack or any other external system, write out exactly what you will do
   and wait for his explicit yes. Approval is per action. **Exceptions (24 Nov 2026,
   team process):** a lane pushes to `dev` and moves its own ticket to In Progress /
   In Review without asking; the TM creates and routes tickets.
2. **Never push to `main` or `caterplan` unless he says so** — both are production. His
   yes is given in the Task Manager session and enforced by the push hook (one-shot
   approval file). Ask separately before merging to `main`.
3. **Stage specific files only** — never `git add -A` / `git add .`. Other Claude
   sessions may share the folder; never stage files you didn't change.
4. **He doesn't do git work** — Claude commits and (when told) pushes. Don't hand him
   commands to run.
5. Deal / billing rules live in the **database per deal** (`deal_rules`), editable in
   the admin — **never in code**.
6. Linear ticket id (`CF-N`) in commit messages when a ticket exists.
7. Every schema change is a migration file in `supabase/migrations/` (see Migrations).
8. Append to `PROJECT_LOG.md` after every major task.
9. Don't claim something is fixed without a live check (cached bundles have fooled us).
10. **Collect his decisions and to-dos** on `../FOR-IOUSTINOS.md` (skill
    `decisions-page`; the TM owns it). Chat points there in one line.
    (`docs/handoffs/THINGS-FOR-YOU.md` was merged into it on 24 Nov 2026.)

`.claude/settings.json` enforces part of this: denies plain pushes to `main`/`caterplan`,
force-push, `git add -A`/`.`, `git commit -a`, `netlify deploy --prod`; asks before
`supabase db push`; the PreToolUse hook `.claude/hooks/block-main-push.sh` blocks every
push to `main`/`caterplan` except the one sha in `.claude/main-push-approved`.

## Stack
- React 19.2 + **TypeScript ~6.0** + Vite 8, React Router 7 (`BrowserRouter`), Zustand 5
- Netlify (hosting + functions in `netlify/functions/`)
- Supabase (Postgres + Auth + Storage), eu-central-1
- GonnaOrder (GO) — third-party ordering + vouchers, NOT merchant-of-record
- Linear (team `CF`)
- Do not move to TypeScript 7 (breaks Netlify's function bundler).

## Local dev
```bash
npm run dev:netlify   # netlify dev → http://localhost:8888, Vite on 5173
```
- `CHOKIDAR_USEPOLLING=1` stays in the script (watcher reliability; it was originally
  added for the Cowork FUSE mount, that reason is gone).
- **Known broken on a fresh clone (2026-11-16):** `[dev] publish = "dist"` in
  `netlify.toml` makes `netlify dev` read `dist/_redirects`. No `dist/` → `/api/*` is
  not rewritten (returns the SPA). With `dist/` → the `/*` catch-all swallows Vite's
  module requests → blank page. Proposed fix (not yet done): drop `publish` from
  `[dev]` and add a Vite `server.proxy` for `/api` → `/.netlify/functions`. Keep `/*`
  in `_redirects` for production (BrowserRouter + emailed deep links need it).
- Ports 8888/5173 are often held by the Wecook-site dev server on this Mac; use
  `npx netlify dev --port 8891 --target-port 5291 --command "npx vite --port 5291 --strictPort"`.
- Direct function URL always works locally: `/.netlify/functions/<name>`.
- **Build = `vite build`** (no `tsc` in build — deliberate). `npm run typecheck` is
  separate and non-gating. Before pushing function changes, run `npm run build` /
  `netlify build` — Netlify's esbuild catches errors `tsc` misses (duplicate consts).
- **Redirect priority:** Netlify evaluates `_redirects` BEFORE `netlify.toml`, so
  `/api/*` → functions and the `/*` SPA fallback both live in `public/_redirects`, in
  that order. `netlify.toml` has no redirects.
- `.env.local` holds only `VITE_*` vars; `netlify dev` injects server secrets from the
  linked site. Gitignored.

## Service-role pattern (deliberate, differs from Fitpal)
- Browser holds the anon key only (`VITE_SUPABASE_ANON_KEY`).
- RLS = tenant-scoped READs only (employee own data, company admin own company,
  super admin all). Helper fns: `is_cf_admin()`, `current_company_id()`,
  `current_employee_id()`.
- All **writes** go through Netlify Functions with the service-role key, authorised by
  `getCaller()` + `requireRole()` (`netlify/functions/_shared/auth.ts`).
- Service-role key only imported from `netlify/functions/_shared/supabaseAdmin.ts`.

## Git & deploy
- Default working branch: `dev`. `main` = production.
- Netlify builds **`main` only** (`allowed_branches: ["main"]`, verified 2026-11-16).
  `dev` has **no branch deploy**; `dev--company-fooding.netlify.app` does not exist.
  Kept off on purpose (Ioustinos, 24 Nov 2026): QA tests locally, then prod read-only.
- `caterplan` branch = Caterplan **production**, deployed by its own Netlify site (below).
  Worked in the git worktree `../company-fooding-caterplan`, never by switching branches
  in this checkout. Long-lived branch (it has its own lane).
- Git auth = `gh` (keychain). No PAT files.

## Infrastructure (verified 2026-11-16)

### GitHub
- Repo `ioustinos/company-fooding` — **visibility PUBLIC** (older docs said private).
  Treat everything committed as public: no customer PII, no secrets, no deal figures
  beyond what is already here.
- Branches: `main`, `dev` (both `2cc9884` on 2026-11-16), `caterplan` (`aa9b11c`).

### Supabase — `company-fooding`
- Ref `jipkzmtkmpwsuuihghol`, eu-central-1, org `peewverazoehzmjcynfh`.
  ⚠ The same CLI account sees two other projects named `matchio`; always pass
  `--project-ref jipkzmtkmpwsuuihghol`. The `supabase-matchio` MCP is unrelated.
- URL `https://jipkzmtkmpwsuuihghol.supabase.co`;
  dashboard https://supabase.com/dashboard/project/jipkzmtkmpwsuuihghol
- Linked locally (`supabase link`), state in `supabase/.temp/` (gitignored).
- Auth email: Brevo SMTP since 2026-10-04.
- Create auth users with the **Auth Admin API** / `supabase` CLI, not raw SQL into
  `auth.users` (raw SQL needs all 8 token columns = `''` + an `auth.identities` row).
  New `auth.users` rows link to pending `company_users`/`employees` by email via the
  `handle_new_user` trigger.

### Migrations
- 23 applied remotely (latest `20261002100155_22_deal_rules`); 22 files locally
  (`01_…` → `22_…`).
- ⚠ **Naming drift:** remote versions are timestamps, local files are `NN_` — the CLI
  matches none of them. Remote also has `20b_revoke_from_public` (content appears
  folded into local `20_…`); remote 13–15 are named differently.
  **Do not run `supabase db push`** until local files are renamed to the remote
  versions (open item).
- New migrations: `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`.

### Netlify — `company-fooding` (team Wecook, `69bc8b86302c4bf6e17e80ec`)
- Site id `74d83bc6-70f3-466f-8caf-4b65756cb36b`, https://company-fooding.netlify.app
- Linked to GitHub (Netlify GitHub App), production branch `main`, autodeploy on push.
- Build `npm run build`, publish `dist`, functions `netlify/functions`.
- Functions region: **us-east-2** (default) while the DB is in eu-central-1 — slow
  round trips; open item to move to eu-central-1.
- Scheduled: `cf-scheduled-sync` every 30 min, `cf-topups-cron` 04:00.
- Env var names: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `GONNAORDER_API_BASE`, `GONNAORDER_USERNAME`,
  `GONNAORDER_PASSWORD`, `CF_ADMIN_TOKEN`, `CF_WEBHOOK_KEY`, `RESEND_FROM_ADDRESS`,
  `CF_TOPUPS_DRY_RUN`, `ANTHROPIC_API_KEY`. ⚠ The service-role key, GO password and
  admin token are not flagged `is_secret` (open item).
- Local link: `.netlify/state.json` in this folder. **Never run a site-scoped
  `netlify` command from a folder without its own link** — the CLI walks up to
  `~/.netlify/state.json` (it happened 2026-11-16; fixed).

### Netlify — `caterplan`
- Site id `474d9e43-6bbe-4614-b892-c3372a965305`, https://caterplan.netlify.app
- Same repo, branch `caterplan`, base dir `caterplan/`, autodeploy on.
- Env: `ANTHROPIC_API_KEY`, `VITE_CATERPLAN_LOCK` (build-time; `off` now).

### Linear
- Workspace `wecook`, team `CF` (id `2bed62a5-8cfe-4b9c-a97d-d31388a0f988`)
- Project "Company Fooding — MVP v1" (id `dbaf4703-32d4-44d8-8698-8750148f5c02`),
  https://linear.app/wecook/project/company-fooding-mvp-v1-0917b77bd397

### GonnaOrder
- API base `https://admin.gonnaorder.com/api/v1` (not api.gonnaorder.com).
- Auth: login → JWT (`GONNAORDER_USERNAME`/`PASSWORD`). No static key.
- Stores: 5677 (Queensway Group canteen — Queensway Navigation, Paricom, Vsltec),
  5909 (Pollfish), 7085 (HarborLab).

### Not used
Airtable (none). n8n is external (his), still runs voucher refills + HarborLab loyalty
until the CF-104 cutover.

## Domain rules & decisions
- **Money in cents** (int); `fmtMoney(cents, lang)`. Bilingual `_el`/`_en` columns,
  `makeTr(lang)`. Business dates = Europe/Athens calendar dates (`isoDate()`). All
  tables have `created_at`/`updated_at` (trigger `tg_set_updated_at`).
- **Invoices in CF are an indication of what to charge**, not real invoices; real
  invoicing happens in tax-authority-approved systems (CF-110 cancelled, 2026-10-30).
- **Deal rules** (`deal_rules`, migration 22): typed, dated rows per agreement; several
  kinds can coexist. Minimum (daily/weekly/monthly, € or N orders × benefit), loyalty
  ("spend X → Y"), order discount (% or €), catalogue discount (separate kind).
  Invoice = max(minimum, benefit − discount). Minimum counts days with ≥1 order, or an
  imported calendar (optional "order day overrides calendar"). Rules don't drive the
  ordering site — he keeps GO in sync by hand. Only super admins edit rules for now;
  later propose/accept between company and vendor.
- **Order split stored at write time:** `orders.vendor_discount`, `orders.vendor_loyalty`.
  Invariant: subtotal = vendor_discount + benefit + loyalty + topup. Benefit is used
  first; loyalty only covers what's above it.
- Current discounts: Queensway, Paricom, Vsltec 10%; Pollfish 7%; HarborLab 0% (its 15%
  catalogue discount goes to employees; the ~€1.72/order menu-level gap is intentional
  and not shown as a CF column).
- HarborLab: benefits daily Mon–Fri, reset (no carryover); loyalty is Wecook's
  ("every €20 → €1"), from 14 Sep; €50/day minimum on weekdays with orders.
- Auth UX: magic-link invite + in-account password reset for company admins; OTP login
  is his long-term preference (not built).
- Login routing: `RoleLanding` sends super_admin → `/admin`, company_owner/admin →
  `/company`, employee → EmployeeApp.

## GonnaOrder integration — facts & traps
- Vouchers are balance-only. CF's plan: mint once per assignment, top up on schedule
  (`benefits.topup_cadence`, `carryover`), record each attempt in `benefit_topups`
  (unique `(assignment_id, scheduled_for)`), reconcile daily. Retries 05:00/08:00/12:00.
- A GO **store** = one (vendor × company) relationship; id on
  `agreement_shops.gonnaorder_shop_id`. One store can serve several legal entities.
- **Orders are matched to employees only while a sync runs.** Match order: voucher code
  vs `employees.external_ref` (case-insensitive) → assignment voucher codes → customer
  email; ambiguous = no match. An employee added after their orders synced leaves those
  orders with `employee_id/company_id = NULL` (excluded from reports) until a backfill.
- Only **CLOSED** GO orders are synced (`listOrders` default).
- `order_token` is **not unique** — match by GO uuid.
- Scheduled sync: LOOKBACK_DAYS 30, but it has stopped short (~20 days) — likely the
  function timeout. The background backfill (`cf-sync-trigger-background`,
  super_admin, 15 min) is the reliable way to go further back. Stores are processed in
  parallel, upserts in chunks of 200.
- Store 7085 search results carry no `voucherCode`; member-code orders have only
  `customerEmail`; loyalty orders have `voucherCode=null` but `voucherDiscount` set.
  `totalNonDiscountedPrice` ≈ list price.
- Sheet CSV exports: Excel mangles tokens like `7E-65`; some rows have a blank UUID.

## SQL gotchas
- Table is `matchmaking_agreements` (not `agreements`); `benefits` has no `name`.
- Ambiguous `status`/`created_at` in joins; `month` is reserved.

## Project structure (2026-11-16)
```
src/
  App.tsx, AdminApp.tsx, CompanyApp.tsx, EmployeeApp.tsx, main.tsx
  components/guards/RoleGuard.tsx, components/layout/Header.tsx
  lib/        supabase, helpers, translations, csv, invoicePdf, dealRuleText, spec*
  pages/      Login, ForgotPassword, ResetPassword, NotFound, auth/
    admin/    Reports, CompaniesReport
    company/  Dashboard, Employees(+Edit), Benefits(+Edit), Groups, Vendors(+Detail),
              DealTerms, Reports, Invoices, Topups, Reconcile, VouchersHealth,
              WebhookEvents, Activity, Settings
    employee/ Home, Orders, Profile, Vendors
  store/      useAuthStore, useCompanyStore, useUIStore
netlify/functions/
  _shared/    supabaseAdmin, auth, errors, activity, gonnaorder, parseGonnaOrder,
              syncGonnaOrder, billingSplit, dealRules(+Core, +Validate), topups
  cf-*.ts     26 functions (sync, scheduled-sync, sync-trigger-background, reconcile,
              topups(+cron), deal-rules, vendors, report(s), invoices, webhook, …)
caterplan/    only on branch `caterplan`
supabase/migrations/  01–22 (see Migrations)
scripts/      fetch-go-orders.py, sql/, skill-patches/
docs/         SPEC.md, LINEAR_PLAN.md, CLAUDE-CODE-SETUP.md
```

## Routes
`/login`, `/forgot-password`, `/reset-password` public · `/` employee (RoleLanding
dispatches by role) · `/company/*` company_owner/admin · `/admin/*` super_admin.

## Knowledge layers
1. `CLAUDE.md` (this file) — rules, infra, decisions
2. `PROJECT_LOG.md` — history, newest first
3. Linear team `CF`
4. Claude Code auto-memory for this folder — preferences only, no infra duplicates

Start of a session: read this file and the top of `PROJECT_LOG.md`, check open CF-*
issues, then ask what's next.

## Docs
- `docs/SPEC.md` — technical spec · `docs/LINEAR_PLAN.md` — original epic plan
- `docs/CLAUDE-CODE-SETUP.md` — the 2026-11-16 move from Cowork to Claude Code
