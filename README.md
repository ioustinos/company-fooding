# Company Fooding

B2B enterprise food-benefit platform. Companies fund employee meal benefits
that redeem at partner vendors via GonnaOrder vouchers.

Temporary working name until rebrand — used across the repo, Linear team,
Supabase project, and Netlify site.

## Quick start

```bash
npm install
cp .env.example .env
# fill in Supabase + GonnaOrder + Resend keys
netlify dev
# → http://localhost:8888
```

## Stack

| Layer       | Choice                                    |
|-------------|-------------------------------------------|
| Frontend    | React 19.2, TypeScript 6, Vite 8          |
| Routing     | React Router 7                            |
| State       | Zustand 5                                 |
| Backend     | Netlify Functions (Node)                  |
| Database    | Supabase (Postgres + Auth + Storage)      |
| Ordering    | GonnaOrder (balance-only vouchers)        |
| Email       | Resend                                    |

## Architecture

Three stakeholder apps served from one React SPA:

- **Employee** at `/` — daily balance + redirect to active vendor voucher
- **Company admin** at `/company/*` — manage employees, benefits, invoices
- **Super admin** at `/admin/*` — manage companies, vendors, platform

Privileged writes go through **Netlify Functions** using a **service-role**
Supabase key. The browser holds **only** the anon key. RLS on the database is
narrowed to tenant-scoped reads. See `CLAUDE.md` for details.

## Folder layout

- `src/` — React app
- `netlify/functions/` — serverless backend (TypeScript)
- `supabase/migrations/` — database migrations (to be added in Phase 4)
- `docs/SPEC.md` — full technical spec
- `docs/LINEAR_PLAN.md` — epic + sub-issue breakdown

## Environment variables

See `.env.example`. Service-role key is **server-only** — never prefix with
`VITE_` or it leaks to the browser bundle.

## Deploying

Netlify builds from the `dev` and `main` branches:
- `dev` → staging
- `main` → production

## License

Proprietary — WeCook.
