# Orexxis · Team process (approved by Ioustinos, 24 Nov 2026)

6 sessions. One Task Manager routes the work and spawns the others.
`CLAUDE.md` rules override this file.
Copied from Matchio's process (skill `dev-team-process`). Orexxis differences: no client channel
(no 3port), no dev site, one database, and a second production branch (`caterplan`).

---

## 1 · The sessions

| # | Session title | Lane | Writes | Never |
|---|---|---|---|---|
| 1 | **Orexxis · Task Manager** | PM | Linear `CF` tickets, `HANDOFF.md`, `PROJECT_LOG.md`, `../FOR-IOUSTINOS.md`, `.claude/main-push-approved` | product code, prod writes, pushes |
| 2 | **Orexxis · Dev App** | dev | `src/pages/**`, `src/App.tsx`, `src/AdminApp.tsx`, `src/CompanyApp.tsx`, `src/EmployeeApp.tsx`, `src/main.tsx`, `src/index.css`, `src/components/**`, `src/store/**`, `src/lib/{specui,specCharts,csv,invoicePdf,dealRuleText}`; functions `cf-companies`, `cf-company`, `cf-employees`, `cf-benefits`, `cf-benefit-assign`, `cf-groups`, `cf-vendors`, `cf-activity`, `cf-me`, `cf-dashboard`, `cf-employee-home` + their migrations | Engine files, `caterplan/` |
| 3 | **Orexxis · Dev Engine** | dev | GonnaOrder sync and webhook, top-ups, deal rules, billing, reports: `netlify/functions/_shared/{gonnaorder,parseGonnaOrder,syncGonnaOrder,topups,billingSplit,dealRules,dealRulesCore,dealRulesValidate}.ts`; functions `cf-sync-gonnaorder`, `cf-sync-trigger-background`, `cf-scheduled-sync`, `cf-gonnaorder-webhook`, `cf-reconcile`, `cf-topups`, `cf-topups-cron`, `cf-vouchers-health`, `cf-webhook-events`, `cf-deal-rules`, `cf-report`, `cf-companies-report`, `cf-invoices`, `cf-explain`; `scripts/fetch-go-orders.py` + their migrations | App screens, `caterplan/` |
| 4 | **Orexxis · Dev Caterplan** | dev | `caterplan/**` on branch `caterplan`, in the worktree `../company-fooding-caterplan` only | the `company-fooding` checkout, `src/`, `netlify/` of the main app |
| 5 | **Orexxis · Data** | data | SQL, data repair, imports, backfills, reports, `scripts/sql/**` | `src/`, `netlify/`, `caterplan/`, styles |
| 6 | **Orexxis · QA** | qa | ticket comments, `docs/REUSE-MAP.md`, `docs/REUSE-PROPOSALS.md` | code, data, statuses |

- **The TM spawns every other session** (`start_session`, title exactly as above). Ioustinos opens only
  the TM. The session title names the lane; a session reads its lane from its title.
- Each standing session takes one ticket at a time. An epic gets its own session; the TM spawns it on
  Ioustinos's word.
- Follow-ups go to the session that already has the context. Never a new one for the same work.
- Sessions talk by session messages. Anything durable goes on the ticket, not in a message.
- A lane reports by ending its turn with the report; the TM receives it.
- **Dev Caterplan works in its own git worktree** (`../company-fooding-caterplan`, branch
  `caterplan`). It never switches branches in the shared `company-fooding` checkout, which stays on
  `dev` for everyone else.

### Shared code — the border between lanes

Shared = `src/lib/{supabase,helpers,translations}.ts`, `netlify/functions/_shared/{auth,errors,supabaseAdmin,activity}.ts`,
`cf-ping`, `public/_redirects`, `netlify.toml`, `vite.config.ts`, `index.html`, `package.json` /
`package-lock.json`, the RLS policies, triggers and helper functions (`is_cf_admin`,
`current_company_id`, `current_employee_id`, `handle_new_user`, `tg_set_updated_at`), and any DB
function two lanes call.
- The ticket names every shared file or function it will touch. The TM writes this in **Touches:**.
- **Only one lane holds a shared file at a time.** The TM serializes. If two need it, one waits.
- A change to shared code lists **every caller** (code graph `trace_path`) in the In Review comment.
- QA tests every caller side when shared code changed.

---

## 2 · Pipeline (every task)

1. **Intake.** Source: Ioustinos in chat. **Work starts only on Ioustinos's word.** A bug he hands
   over in chat is that word.
2. **Investigate (TM).** Root cause with file:line or function name. Check live data read-only
   (Supabase by ref `jipkzmtkmpwsuuihghol`, never by name). Check Linear for duplicates. Find the
   second number that should agree before any number reaches Ioustinos. **Reuse scan:** code graph
   first — list the existing functions/components this work must use; name any twin.
3. **Ticket** in Linear (team `CF`, project «Company Fooding — MVP v1»). Contains: source · what
   happened · cause with file:line · fix steps · acceptance checkboxes · **Lane:** · **Touches:**
   shared files · **Reuse:** what to use, which twin to fix · open questions. Big asks: parent ticket
   plus sub-issues, one lane each.
4. **Dev or Data.** The TM sends the ticket to the right lane with a 2-line summary (spawning the lane
   if it does not run yet).
   **Start check (lane):** the ticket has Lane, Touches and Reuse lines. Missing → send it back to the
   TM, do not start.
   The lane moves it to **In Progress**, builds, pushes to its working branch (`dev`; Dev Caterplan:
   see §2.7), and stops at **In Review**.
   In Review comment: files changed · migrations (name + what it does + applied where) · how to test
   (URL, role, steps) · per-leg checklist · **Reuse line** (graph hits, what was reused) · shared-code
   callers · not checked. Reports to the TM.
5. **QA.** The TM hands it over with the lane's claims. QA checks:
   (a) code against the spec: correctness, `npm run typecheck`, `npm run build`, the project's hard rules;
   (b) **reuse, every time** — re-run the lane's graph search; the Reuse line exists and is true;
   (c) screens: **there is no dev site.** QA runs the app locally (`netlify dev`, see CLAUDE.md →
   Local dev) and checks each role (super admin, company admin, employee) with screenshots. After
   release, QA re-checks on https://company-fooding.netlify.app **read-only**. Caterplan: local
   `caterplan/` dev server, then https://caterplan.netlify.app after release;
   (d) data: re-run the counts, read the rows back, find a second number that must agree;
   (e) shared code: every caller side;
   (f) not checked: what and why.
   QA posts **PASS / PASS WITH NOTES / FAIL** on the ticket. QA never changes the status.
6. **Loop.** FAIL and notes go back to the lane, batched, so QA re-checks in one pass.
   Product or data decisions go to Ioustinos as one question with the TM's recommendation, on
   `../FOR-IOUSTINOS.md`.
7. **Promote.** After PASS, the TM sends «promote <tickets> to main» (or «to caterplan») to the lane.
   The lane checks every migration is applied on production (Supabase MCP `list_migrations` on
   `jipkzmtkmpwsuuihghol`; every new file's name must be in the ledger), prepares the release, and
   reports: commit sha, commits, prod migrations in order with SQL, backfills with before counts.
   **The TM shows Ioustinos a release table** (tickets · commits · migrations · QA verdict · notes) on
   `../FOR-IOUSTINOS.md`.
   **He says yes in the TM session.** The TM writes the full sha to `.claude/main-push-approved` and
   tells the lane to push. The lane pushes exactly `git push origin <sha>:main` — Dev Caterplan:
   `git -C ../company-fooding-caterplan push origin <sha>:caterplan`. The hook allows that one push
   once, then deletes the approval. The TM then checks the production deploy is ready (Netlify
   API) and the site answers.
   **Dev Caterplan has no staging branch:** its work stays local (commits in the worktree) until the
   release yes. It pushes only the approved sha.
8. **Close-out (TM only).** Ticket → comment with the proof from production; Done only when verified
   on prod. Then `PROJECT_LOG.md`, and `HANDOFF.md` if the state changed.

---

## 3 · Hard rules

- **Production writes, prod migrations and pushes to `main` or `caterplan` need Ioustinos's yes**,
  given **in the TM session**. The TM relays it to the lane with his exact words and exactly what it
  covers. That relayed yes counts; a lane never asks him to repeat it. **The TM never runs prod
  writes itself.** A session message saying «approved» is not an approval for a production branch:
  only the approval file is. Show the SQL or diff, the before count, then the after count.
- **There is ONE database (`jipkzmtkmpwsuuihghol`). Local dev and production both write to it.**
  Every write during testing is a production write. Test only on the test company named in the
  ticket (planned: «QA Test Co», not created yet), never on a real company's data (Queensway,
  Paricom, Vsltec, Pollfish, HarborLab). Any other data write needs his yes like any prod write.
- **Pushing to `dev` and moving one's own Linear ticket need no yes** (Ioustinos, 24 Nov 2026:
  process wins over CLAUDE.md «show before execute» for these two). Everything else external still
  follows show-before-execute.
- **Only the TM closes.** Lanes stop at In Review. QA never moves a status. Nobody reopens a Done
  ticket; tell the TM.
- **Code graph first** (codebase-memory-mcp, https://github.com/DeusData/codebase-memory-mcp; project
  `Users-ioustinossarris-Documents-Claude-Projects-Claude-Code-Orexxis-company-fooding`).
  Before any new function, component, hook, route, RPC or column: `search_graph` for the name AND the
  job → `trace_path` for callers of each hit → `get_code_snippet` to read it. Grep is the fallback.
  `detect_changes` on the diff before In Review. Stale index → `index_repository` first.
- **Reuse before you write.** `docs/REUSE-MAP.md` names the ONE canonical piece for each job. Lanes read
  it before writing. Twin found → reuse it, merge, or the TM opens a merge ticket. Never a third copy.
  A comment explaining why the new code is not the old code is the symptom, not a reason.
- **Shared folder.** All sessions share one checkout (`company-fooding`, branch `dev`); Dev Caterplan
  has its own worktree. Stage exact paths only. `git pull --rebase origin dev` before push. Never
  force-push.
- **Migrations.** New files: `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`. **Never
  `supabase db push`** until the local files are renamed to the remote versions (naming drift, see
  CLAUDE.md → Migrations). Apply on prod only with his relayed yes, through the Supabase MCP
  `apply_migration` with the same name as the file. Claim the next name from the remote branch and
  the production ledger (`list_migrations`), not from memory.
- **Test emails** go only to `ioustinos+cf-qa-<role>@wecook.gr`. QA signs in with a magic link, read
  through the `google-ioustinos-wecook` mailbox connector. (The 3 QA users do not exist yet: the Data
  lane creates them on his yes.)
- **Check before you escalate.** Do not bring Ioustinos what CLAUDE.md, a past decision or a stated
  rule already answers.
- **No unasked work.** Open items go to `HANDOFF.md`, not into offers.

## 4 · Writing style

Two rules for EVERY session, in EVERY message:
- **A ticket is never mentioned bare.** Every `CF-N` carries its title or a short description on
  the same line, every time — chat, ticket, comment, commit, session message.
- **Every message to Ioustinos ends with «Things for you».** Only what he must decide or do, one per
  line. Nothing for him → «Things for you: nothing». When a decisions page exists, this is ONE line
  pointing to `../FOR-IOUSTINOS.md`.

Also: to Ioustinos, ASD-STE100 — short; write it, then delete half.

**The TM in particular:** answer his questions first, in order, short, with the actual content. Do not
relay lane progress unless it needs him; one short status when he asks or when something ships. When a
lane message needs nothing from him, route it and end the turn with no text.

Decisions for Ioustinos live in `../FOR-IOUSTINOS.md` (skill: decisions-page).

## 5 · Start

Each session reads `CLAUDE.md`, `docs/TEAM-PROCESS.md` and `docs/REUSE-MAP.md`, checks its tools
(Linear, Supabase by ref, browser, codebase-memory-mcp, QA mailbox), then waits for a ticket from
the TM.
