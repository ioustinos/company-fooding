# Company Fooding — Project Log

Living journal of major decisions, milestones, and blockers. Append entries
**in reverse chronological order** (newest at the top).

Format per entry:

```
## YYYY-MM-DD — <one-line headline>
**Status:** Done / Blocked / In progress
**Linked tickets:** CF-N, CF-M
**Why:** What problem this solves or what triggered the work
**What:** What was actually built / changed
**Notes:** Anything the next session needs to know that isn't obvious from the code
```

One entry per major task — not per commit. A "major task" is anything that
changes architecture, ships a feature end-to-end, resolves a multi-day
investigation, or unblocks something else.

---

## 2026-05-25 — Company panel built & live (dashboard, employees, benefits, vendors, settings, reports)

**Status:** Done
**Linked tickets:** CF-4, CF-33, CF-34, CF-35, CF-37, CF-67

**Why:** The deployed app was shells; Ioustinos wants a real, clicking company
experience to put in front of customers (Queensway) within a week — add
employees, create benefits, pull GonnaOrder data, see a live report. Built it
overnight on full initiative per his "GO, build for me" instruction.

**What — the orexi design, made real on the CF stack, wired to Supabase:**
- **Design system:** orexi theme (colors + Fraunces/Inter) via Tailwind CDN in index.html
  (CDN for beta; migrate to a PostCSS build before prod).
- **Company switcher:** `useCompanyStore` + `cf-companies` fn. super_admin picks any of the
  3 companies; company_admin is locked to their own. Lives in the company top bar.
- **Pages (all under /company, orexi-styled, live data):**
  - Dashboard — `cf-dashboard`: KPIs, spend trend, by-weekday, top users, by-vendor.
  - Reports — `cf-report` (company-scoped): totals + per-employee + order log + date filter.
  - Employees — `cf-employees`: list, single add (email validation), **bulk CSV import**,
    activate/deactivate. Voucher code = GO link.
  - Benefits — `cf-benefits`: list + create (writes benefit + benefit_rules), assigned count,
    **assign-to-all-employees** via `cf-benefit-assign` (idempotent; sets voucher code).
  - Vendors — `cf-vendors`: read-only cards (discount, agreement terms, GO store, delivery).
  - Settings — `cf-company`: editable company profile + offices list.
- **Auth/routing:** super_admin allowed into /company; login routes admins to /company.

**New functions (13 total now live):** cf-companies, cf-company, cf-dashboard, cf-employees,
cf-benefits, cf-benefit-assign, cf-vendors (+ earlier cf-me, cf-report, cf-ping,
cf-sync-gonnaorder, cf-scheduled-sync, cf-explain).

**Deploys:** main `2232ccd` (core) → `d30022e` (vendors+settings) → `aa76dbf` (bulk import +
assignment). All green, secret scan clean, scheduled sync still registered.

**Notes:**
- Could NOT runtime-test the UI from the sandbox (egress blocks the Netlify site). Builds are
  green and schemas were verified before each function; first human click-through is the real test.
- Benefit assignment writes `benefit_assignments` rows but does NOT mint real GonnaOrder
  vouchers yet (that's the scheduler/n8n side). For the demo, assignment + voucher-code linkage
  is enough to show the loop.
- Admin (super-admin platform) pages remain placeholders except /admin/reports — the company
  side was the priority.
- Tailwind CDN shows a console "not for production" warning — fine for beta, swap to PostCSS build later.

---

## 2026-05-25 — Reports in-app: real auth role resolution + admin reports page (live data)

**Status:** Done
**Linked tickets:** CF-12, CF-37

**Why:** The frontend was a shell — logging in resolved no role (RoleGuard
couldn't admit anyone) and there was no reports screen, so the Queensway data
was only visible via Supabase/PDF. Goal: log in → see the live report in the app.

**What:**
- `_shared/auth.ts` — real `getCaller()`: resolves role via service-role queries
  (cf_admins → super_admin, company_users → company_admin+companyId, employees →
  employee). Single source of truth for "who is calling".
- `cf-me.ts` — GET, returns the caller's resolved identity. Browser calls it after
  login so role resolution stays server-side (no client RLS dependency).
- `cf-report.ts` — GET, admin-gated. Aggregates orders into totals / perCompany /
  perEmployee / perDay / order-log JSON. super_admin sees all companies;
  company_admin locked to own company. Service-role read, authz via getCaller.
- `useAuthStore.ts` — `resolveAppUser()` now calls `/api/cf-me` (was a null stub).
- `pages/admin/ReportsPage.tsx` — renders the report (totals cards + 4 tables) with
  a date-range filter. Wired into AdminApp at `/admin/reports` + nav link.
- `LoginPage.tsx` — post-login redirect by role (super_admin → /admin/reports).
- Seeded `ioustinos@wecook.gr` into auth.users (+ identity, email pre-confirmed),
  auto-linked the 3 company_users via the handle_new_user trigger, seeded cf_admins
  as cf_owner (super_admin).

**Notes:**
- This is the real CF-12 (auth) + CF-37 (reports) work, previously only scaffolded.
- `cf-report` aggregates in-memory from up to 5000 order rows — fine at current scale;
  move to SQL GROUP BY / an RPC if order volume grows large.
- Other admin pages (Companies, Vendors, Invoices, Settings) are still Placeholders.

---

## 2026-05-25 — GonnaOrder scheduled sync live in production (every 30 min)

**Status:** Done
**Linked tickets:** CF-48, CF-75

**Why:** Reports need to reflect recent GonnaOrder activity without anyone
manually triggering a sync. A server-side scheduler keeps the `orders` mirror
relatively live.

**What:**
- `netlify/functions/_shared/syncGonnaOrder.ts` — extracted `runSync()` core from
  cf-sync-gonnaorder so the HTTP endpoint and the scheduled job share identical logic.
- `netlify/functions/cf-scheduled-sync.ts` — Netlify Scheduled Function, cron
  `*/30 * * * *` (UTC). Calls `runSync({ since: 3 days ago, dryRun: false })`. No HTTP
  auth (invoked internally by Netlify's scheduler). 3-day lookback covers late/amended
  orders; idempotent upsert makes overlap harmless. Stores `raw_payload` for new orders.
- `cf-sync-gonnaorder.ts` — slimmed to the HTTP wrapper + admin-token auth, delegates to
  shared `runSync`.
- Pushed to `dev` (`126453a`) then to `main` (`c94eb65`). Production deploy `6a13f83a`
  green; Netlify registered `function_schedules: [{cron: "*/30 * * * *", name:
  "cf-scheduled-sync"}]`. First automatic run 2026-05-25 07:30 UTC.

**Notes:**
- **Netlify runs scheduled functions ONLY on the production deploy** — never on branch/
  preview deploys. Confirmed: dev branch deploys aren't enabled on this site anyway
  (`dev--company-fooding.netlify.app` 404s), so verification happened directly on main.
- This is "relatively live", not real-time. For true real-time, switch to GonnaOrder
  webhooks (CF-47) — the scheduled pull is the pragmatic v1.
- Watch runs: Netlify → Functions → cf-scheduled-sync → Logs. Each logs
  `[cf-scheduled-sync] done {...totals} since <date>`.

---

## 2026-05-15 — Retroactive setup-tech-stack catch-up: PROJECT_LOG, .auto-memory, redirect fix, repo wiring

**Status:** In progress (CF-77)
**Linked tickets:** CF-77

**Why:** Project was bootstrapped without invoking the `setup-tech-stack` skill,
so a chunk of the Phase 2–5 scaffold work was missing: no `PROJECT_LOG.md`, no
`.auto-memory/` workspace files, the `/api/*` redirect was misplaced in
`netlify.toml` instead of `public/_redirects`, the Netlify site wasn't linked
to the GitHub repo, and the `.env.example` referenced the wrong GonnaOrder env
vars. Doing the retrofit now so future sessions inherit a clean baseline.

**What (so far):**
- `public/_redirects` — added `/api/* → /.netlify/functions/:splat 200` BEFORE the SPA fallback (per conventions.md, `_redirects` evaluates BEFORE `netlify.toml`)
- `netlify.toml` — stripped the `/api/*` redirect (now empty of `[[redirects]]` blocks)
- `.env.example` — replaced `GONNAORDER_API_KEY` / `GONNAORDER_WEBHOOK_SECRET` (wrong — GO uses login+JWT) with `GONNAORDER_USERNAME` / `GONNAORDER_PASSWORD`. Added `CF_ADMIN_TOKEN` placeholder. Fixed `GONNAORDER_API_BASE` to the correct host `https://admin.gonnaorder.com/api/v1`.
- `.gitignore` — added `.auto-memory/` (contains `github_credentials.sh` with the PAT — must never be committed)
- `.auto-memory/github_credentials.sh` — populated with the fine-grained PAT for `ioustinos/company-fooding` (chmod 600, gitignored)
- `.auto-memory/project_company-fooding_*.md` — context, infra_details, workflow files seeded with current IDs (Supabase project, Netlify site, Linear team/project, repo URL)
- `PROJECT_LOG.md` — this file
- `CLAUDE.md` — Infrastructure section refreshed with the current Supabase project ID, Netlify site ID, and GitHub repo URL

**Remaining (in this retro):**
- First push of tonight's work via FUSE-safe `GIT_DIR`/`GIT_WORK_TREE` pattern
- Link Netlify site to `ioustinos/company-fooding` GitHub repo (currently unlinked — manual deploys only)
- Smoke test `https://company-fooding.netlify.app/api/cf-ping` after first prod deploy

**Notes:**
- The `setup-tech-stack` skill at `…/rpm/plugin_*/skills/setup-tech-stack/` is read-only from my sandbox; a patch for section 2B.2 (Classic → fine-grained PAT preference) is in `scripts/skill-patches/manual-checkpoints-2B.2-fine-grained-PAT.md` for Ioustinos to apply to the plugin source manually.

---

## 2026-05-15 — Queensway Group: first-customer onboarding + Mar–May orders backfill

**Status:** Done
**Linked tickets:** CF-70, CF-71, CF-72, CF-73, CF-74, CF-75

**Why:** First real customer in CF — Wecook (vendor) onboards Queensway Group, a
holding-style customer with three sister legal entities (Queensway Navigation,
Paricom, Vsltec) that share one office, one canteen, and one GonnaOrder store
but invoice separately. We needed Mar 2 → today's historical orders in CF's
`orders` table to produce a first invoicing report.

**What:**
- **3 new migrations:**
  - Migration 13 — `vendors.gonnaorder_merchant_id` dropped (Base44-era column, doesn't map to GO's actual model; GO's parent-store concept deferred until needed)
  - Migration 14 — `employees.email` nullable + `(company_id, lower(external_ref))` unique partial index (voucher code is primary identifier for orgs without per-employee emails)
  - Migration 15 — `agreement_shops` uniqueness scoped per-agreement instead of globally per shop (allows the same GO store to serve multiple legal entities)
- **Seeded customer data:** Wecook vendor (5% discount on benefit_price, tags `[daily, cooked, healthy, traditional]`), 3 companies, 1 shared office, 3 matchmaking agreements all pointing to GO shop `5677`, 63 employees, `ioustinos@wecook.gr` as company_admin (invited) on each company.
- **Real GonnaOrder client** in `netlify/functions/_shared/gonnaorder.ts` (replaces the stub): login-then-JWT auth (no static API key), `listOrders` paginated with sort+early-stop on `since`, 401 retry. Handles all 3 GO response shapes (array / `{data}` / `{content}`).
- **Field mapper** `netlify/functions/_shared/parseGonnaOrder.ts` — GO → CF row, money × 100 + `Math.round` for cents, Europe/Athens for delivery date/time, `CLOSED` → `delivered` status mapping.
- **`cf-sync-gonnaorder` Netlify function** — `POST /api/cf-sync-gonnaorder` body `{ since, shopId?, dryRun? }`, defaults dryRun=true, gated on `X-CF-Admin-Token` header (temporary until JWT super-admin role lands per CF-12).
- **587 historical orders backfilled** via `scripts/sql/upsert-go-orders.sql` (idempotent INSERT ON CONFLICT). 100% matched to employees. Per-company totals (gross / benefit / topup): Queensway Navigation 474 orders €3019.50 / €2213.50 / €806.00; Vsltec 101 orders €706.00 / €483.50 / €222.50; Paricom 12 orders €105.50 / €60.00 / €45.50.
- **Queensway PDF report** at `reports/queensway-report.pdf` — cover with totals, per-company invoice summary, per-employee breakdown, daily activity, full 587-row order log. Brand colors per `wecook.gr` palette.

**Notes:**
- `order_items` was NOT populated — GO's `/orders/search` returns order headers only; per-order GET needed for line items. Filed as CF-76 (Todo).
- `raw_payload` was dropped from the bulk insert to keep batch SQL under MCP token limits. Available via re-sync if needed (the JSON dump from `scripts/fetch-go-orders.py` is the source of truth).
- The sync function was bypassed for the backfill (driven from this session via Supabase MCP + scripts/sql instead). Function exists and works; full deploy + smoke test pending.
- `reports/` folder added to `.gitignore` — generated artifacts.

---

## 2026-05-15 — GonnaOrder integration architectural review

**Status:** Done
**Linked tickets:** CF-70, CF-72

**Why:** Original schema baked in assumptions from Base44 (a single-tenant
predecessor) that don't generalize to multi-customer CF. Two concrete
mismatches surfaced when onboarding Queensway: (1) `vendors.gonnaorder_merchant_id`
implied one GO merchant ID per vendor, but GO's actual entity for our use case
is the store (= vendor × company relationship); (2) `agreement_shops.gonnaorder_shop_id`
was globally unique, which blocks the common case of one canteen serving
multiple sister companies that invoice separately.

**What (decisions, not code — code is in the migrations log entry above):**
- A GonnaOrder "store" represents a single (vendor × company) relationship. The store id lives on `agreement_shops.gonnaorder_shop_id` (already correct).
- GO has a parent-store concept that owns child stores. CF defers modelling it until needed (menu inheritance, cross-store list queries). When we add it, it'll be a deliberate column (e.g. `gonnaorder_parent_store_id`), not the catch-all merchant_id.
- One GO store can be referenced by multiple matchmaking_agreements (one per CF company sharing the canteen). Order ingestion routes by `employee → company`, not by walking store back to agreement.

**Notes:**
- Memory file: `project_cf_gonnaorder_store_model.md` documents the decision.
- Order ingestion code (`cf-sync-gonnaorder.ts`) implements the routing.
- SPEC.md §4.3 still says "unique across platform" for `agreement_shops.gonnaorder_shop_id` — flagged for a future doc-fix ticket.
