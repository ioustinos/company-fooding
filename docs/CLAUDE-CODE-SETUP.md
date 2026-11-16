# Move to Claude Code — 2026-11-16

Company Fooding / Orexis development moved from Cowork and claude.ai chats to
**Claude Code on Ioustinos's Mac** on **2026-11-16**.

## Decisions taken
| Decision | Detail |
|---|---|
| Fresh clones | `gh repo clone ioustinos/company-fooding` on `dev`, in `~/Documents/Claude/Projects/Claude Code/Orexxis/company-fooding`. The old Cowork folder (`~/Documents/Claude/Projects/Wecook Enterprise Platform`) was never a git repo. Its tracked files were byte-identical to the clone; nothing was copied from it. |
| Repo = memory | Rules, infra ids and decisions are in `CLAUDE.md`, history in `PROJECT_LOG.md`. The Cowork `.auto-memory/` and claude.ai project memory are no longer sources of truth; their content was folded in. Raw handoffs go in `docs/handoffs/`, which is **gitignored** for as long as the repo is public. |
| Machine git auth | `gh` CLI (keychain token). The fine-grained PAT in `.auto-memory/github_credentials.sh` is no longer used and should be revoked. |
| CLI-first | `gh`, `supabase`, `netlify` CLIs and the Netlify REST API, instead of dashboards or MCP workarounds. The MCPs (Linear, Supabase, Netlify, Slack) are still there as helpers. |
| No re-bootstrap | The `setup-tech-stack-cc` skill was used only as an audit checklist. None of its setup steps ran and no infrastructure was created. |
| Standing rules unchanged | Show before execute in external systems, never push to `main` without his say, push only on explicit command, stage specific files only. These are his rules, not sandbox workarounds. |

## Infra ids verified on 2026-11-16
| What | Value | How |
|---|---|---|
| GitHub | `ioustinos/company-fooding`, **PUBLIC**; `main` = `dev` = `2cc9884`, `caterplan` = `aa9b11c` | `gh repo view`, `git ls-remote` |
| Supabase | `jipkzmtkmpwsuuihghol` "company-fooding", eu-central-1, ACTIVE_HEALTHY; 23 remote migrations | `supabase projects list`, `supabase link`, `migration list --remote` |
| Netlify CF | `74d83bc6-70f3-466f-8caf-4b65756cb36b`, team `69bc8b86302c4bf6e17e80ec`; GitHub-linked, production `main`, `allowed_branches ["main"]`, functions us-east-2; live deploy `2cc9884` | `netlify link`, `netlify api getSite` |
| Netlify Caterplan | `474d9e43-6bbe-4614-b892-c3372a965305`; branch `caterplan`, base `caterplan/` | `netlify api getSite` |
| Env var names | 12 on CF, 2 on Caterplan (listed in CLAUDE.md) | `netlify api getEnvVars`, names only |
| Local dev | `/` 200, `/.netlify/functions/cf-ping` ok. `/api/*` is broken under `netlify dev` on a fresh clone (CLAUDE.md → Local dev) | curl + browser pane |
| Production API | `https://company-fooding.netlify.app/api/cf-ping` → 200 | curl |

## CLAUDE.md lines removed as sandbox-only, and why
| Removed | Why it existed | Why it's gone |
|---|---|---|
| "NEVER run git from the workspace folder" | The Cowork FUSE mount blocked `unlink` and broke git lock files | Local APFS has no FUSE. Git runs in the repo normally |
| The `/tmp/company-fooding-pushN` clone + `GIT_DIR`/`GIT_WORK_TREE` push recipe, `safe.directory`, "fresh /tmp path per session" | A workaround for the above, plus stale sandbox ownership of `/tmp` | One repo, one tree. (It also caused a glob bug: CF-103 needed a follow-up commit) |
| "Credentials in `.auto-memory/github_credentials.sh`, source `$GITHUB_TOKEN` every call"; "Auth: fine-grained PAT" | The sandbox had no credential store | `gh auth` (keychain) |
| "`CHOKIDAR_USEPOLLING=1` (required for FUSE mounts)" | Vite's watcher didn't fire on FUSE | The *reason* is removed. The flag stays in `package.json`, since the setup skill keeps it for watcher reliability |
| "Netlify: NOT YET LINKED (CF-77, manual deploys only)" | Stale | Verified as linked |
| "Migrations applied: 01–15" | Stale | 23 remote, 22 local; drift documented |
| "Visibility: Private" | Wrong | The repo is public |
| "`dev` → dev--company-fooding.netlify.app" | Assumed branch deploys | `dev` isn't an allowed branch |
| "Memory files in `<workspace>/.auto-memory/`" as a knowledge layer | A Cowork construct | Claude Code auto-memory is for preferences only; infra lives in CLAUDE.md |
| Project-structure tree (two functions, three pages) | Stale since May | Regenerated |

Also obsolete per the handoffs (they were never in CLAUDE.md, so are simply not carried over):
- the "no outbound HTTP to supabase.co / Auth Admin API" workaround and its "create users in the dashboard" fallback
- "GO API unreachable from shell"
- "deploy blocked from the container; Ioustinos runs `netlify deploy --prod` by hand", and the Netlify MCP proxy-command dance
- building in the Linux VM from staged files
- `rm` blocked → `_to_delete/`
- the hand-rolled `npx esbuild` check, replaced by `npm run build` / `netlify build`. The *rule* of building before pushing functions stays.
- the claude.ai Artifact `downloads` capability (it doesn't port to a local static site).

## Kept deliberately
- `build` = `vite build` with no `tsc`, and the service-role pattern. Both are documented in CLAUDE.md.
- "Specific files only, never `git add -A`." One handoff called this a sandbox defence, but it's Ioustinos's standing rule and the setup skill's rule too, since several sessions may share a folder.

## Fixed during the move
- `netlify link` in a fresh clone with no `.netlify/` folder wrote the site id into `~/.netlify/state.json` (home folder). The link was moved into `company-fooding/.netlify/state.json` and `siteId` removed from the home file. The home file's earlier `siteId`, if it had one, was lost.

## Not done (open, need a decision)
See the open items in `PROJECT_LOG.md` (2026-11-16), plus:
- dev branch deploys vs retiring `dev`
- the functions region
- `is_secret` on 3 env vars
- renaming migration files
- the local-dev redirect fix
- repo visibility
